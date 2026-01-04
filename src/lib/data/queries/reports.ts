/**
 * Report Queries
 * ============================================================================
 * Data queries for all 9 analytics reports.
 * Path: src/lib/data/queries/reports.ts
 */

import { prisma } from '@/lib/prisma';
import { getEffectiveQuantity } from '@/lib/utils';
import type { 
  ExceptionRow, 
  ExceptionType,
  CohortRow,
  AccountPotentialRow,
  RepScorecardRow,
  CustomerLTVRow,
  FirstToSecondRow,
} from '@/lib/types/report';

// ============================================================================
// Date Validation Helper
// ============================================================================

/**
 * Validates and sanitizes a date string to prevent SQL injection.
 * Only accepts YYYY-MM-DD format.
 */
function sanitizeDate(date: string | null): string | null {
  if (!date) return null;
  // Strict YYYY-MM-DD format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // Additional validation: ensure it's a valid date
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return null;
  return date;
}

/**
 * Builds a SQL date condition for filtering.
 * Returns empty string if no valid dates provided.
 */
function buildDateCondition(
  field: string,
  fromDate: string | null,
  toDate: string | null
): string {
  const safeFrom = sanitizeDate(fromDate);
  const safeTo = sanitizeDate(toDate);
  
  if (safeFrom && safeTo) {
    return `AND ${field} BETWEEN '${safeFrom}' AND '${safeTo}T23:59:59'`;
  }
  if (safeFrom) {
    return `AND ${field} >= '${safeFrom}'`;
  }
  if (safeTo) {
    return `AND ${field} <= '${safeTo}T23:59:59'`;
  }
  return '';
}

// ============================================================================
// Exception Report
// ============================================================================

interface ExceptionThresholds {
  lateDays: number;           // Days without order to be "late"
  declinePercent: number;     // Percent decline to flag
  stallDays: number;          // Days for new account to be "stalled"
  deadSkuDays: number;        // Days without sales for "dead" SKU
  hotSkuPercent: number;      // Percent of inventory sold to be "hot"
  underperformPercent: number; // Rep below this % of target
}

const DEFAULT_THRESHOLDS: ExceptionThresholds = {
  lateDays: 90,
  declinePercent: 25,
  stallDays: 60,
  deadSkuDays: 90,
  hotSkuPercent: 80,
  underperformPercent: 50,
};

export async function getExceptionReport(
  thresholds: Partial<ExceptionThresholds> = {},
  fromDate: string | null = null,
  toDate: string | null = null
): Promise<ExceptionRow[]> {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const exceptions: ExceptionRow[] = [];
  const now = new Date();
  
  // 1. Late Accounts (customers who haven't ordered in X days)
  // Requires: CustomerOrders with CustomerID FK populated
  try {
    // Build date filter condition (sanitized to prevent SQL injection)
    const dateCondition = buildDateCondition('c.LastOrderDate', fromDate, toDate);

    const lateAccounts = await prisma.$queryRawUnsafe<Array<{
      CustomerID: number;
      StoreName: string;
      LastOrderDate: Date;
      DaysSinceLast: number;
      UsualCycle: number | null;
    }>>(`
      SELECT 
        c.ID AS CustomerID,
        c.StoreName,
        c.LastOrderDate,
        DATEDIFF(day, c.LastOrderDate, GETDATE()) AS DaysSinceLast,
        c.UsualOrderCycle AS UsualCycle
      FROM Customers c
      WHERE c.LastOrderDate IS NOT NULL
        AND DATEDIFF(day, c.LastOrderDate, GETDATE()) > ${config.lateDays}
        AND c.OrderCount > 1
        ${dateCondition}
      ORDER BY DaysSinceLast DESC
    `);
    
    for (const account of lateAccounts) {
      const expected = account.UsualCycle || config.lateDays;
      exceptions.push({
        type: 'late-account',
        entityId: String(account.CustomerID),
        entityName: account.StoreName,
        metric: 'Days since last order',
        expected: `< ${expected} days`,
        actual: `${account.DaysSinceLast} days`,
        severity: account.DaysSinceLast > expected * 2 ? 'high' : 'medium',
        daysSinceTriggered: account.DaysSinceLast - expected,
        actions: ['Send re-engagement email', 'Schedule rep call', 'Offer discount'],
      });
    }
  } catch (error) {
    // Schema not yet updated - skip this exception type
    console.warn('Late accounts query failed - schema may need updating');
  }

  // 2. Declining Accounts (customers with significant revenue drop)
  try {
    const decliningAccounts = await prisma.$queryRaw<Array<{
      CustomerID: number;
      StoreName: string;
      PriorRevenue: number;
      CurrentRevenue: number;
      DeclinePercent: number;
    }>>`
      WITH RevenueByPeriod AS (
        SELECT 
          co.CustomerID,
          SUM(CASE 
            WHEN co.OrderDate >= DATEADD(month, -6, GETDATE()) 
                 AND co.OrderDate < GETDATE() 
            THEN co.OrderAmount ELSE 0 
          END) AS CurrentRevenue,
          SUM(CASE 
            WHEN co.OrderDate >= DATEADD(month, -12, GETDATE()) 
                 AND co.OrderDate < DATEADD(month, -6, GETDATE()) 
            THEN co.OrderAmount ELSE 0 
          END) AS PriorRevenue
        FROM CustomerOrders co
        WHERE co.CustomerID IS NOT NULL
        GROUP BY co.CustomerID
      )
      SELECT 
        r.CustomerID,
        c.StoreName,
        r.PriorRevenue,
        r.CurrentRevenue,
        CAST((r.PriorRevenue - r.CurrentRevenue) * 100.0 / NULLIF(r.PriorRevenue, 0) AS DECIMAL(5,1)) AS DeclinePercent
      FROM RevenueByPeriod r
      JOIN Customers c ON c.ID = r.CustomerID
      WHERE r.PriorRevenue > 1000
        AND r.CurrentRevenue < r.PriorRevenue * (1 - ${config.declinePercent / 100})
      ORDER BY DeclinePercent DESC
    `;
    
    for (const account of decliningAccounts) {
      exceptions.push({
        type: 'declining-account',
        entityId: String(account.CustomerID),
        entityName: account.StoreName,
        metric: 'Revenue change',
        expected: 'Stable or growth',
        actual: `-${account.DeclinePercent}%`,
        severity: account.DeclinePercent > 50 ? 'high' : 'medium',
        daysSinceTriggered: 0, // Recent period comparison
        actions: ['Review order history', 'Schedule account review', 'Propose product mix change'],
      });
    }
  } catch (error) {
    console.warn('Declining accounts query failed - schema may need updating');
  }

  // 3. Stalled New Accounts (first-time buyers who haven't reordered)
  try {
    const stalledAccounts = await prisma.$queryRaw<Array<{
      CustomerID: number;
      StoreName: string;
      FirstOrderDate: Date;
      DaysSinceFirst: number;
    }>>`
      SELECT 
        c.ID AS CustomerID,
        c.StoreName,
        c.FirstOrderDate,
        DATEDIFF(day, c.FirstOrderDate, GETDATE()) AS DaysSinceFirst
      FROM Customers c
      WHERE c.OrderCount = 1
        AND c.FirstOrderDate IS NOT NULL
        AND DATEDIFF(day, c.FirstOrderDate, GETDATE()) > ${config.stallDays}
        AND DATEDIFF(day, c.FirstOrderDate, GETDATE()) < 365
      ORDER BY DaysSinceFirst DESC
    `;
    
    for (const account of stalledAccounts) {
      exceptions.push({
        type: 'stalled-new-account',
        entityId: String(account.CustomerID),
        entityName: account.StoreName,
        metric: 'Days since first order',
        expected: `Repeat within ${config.stallDays} days`,
        actual: `${account.DaysSinceFirst} days, no repeat`,
        severity: account.DaysSinceFirst > config.stallDays * 2 ? 'medium' : 'low',
        daysSinceTriggered: account.DaysSinceFirst - config.stallDays,
        actions: ['Send follow-up survey', 'Offer new customer incentive', 'Rep outreach'],
      });
    }
  } catch (error) {
    console.warn('Stalled accounts query failed - schema may need updating');
  }

  // 4. Dead SKUs (no sales in X days)
  try {
    const deadSkus = await prisma.$queryRaw<Array<{
      SkuID: string;
      CategoryName: string;
      Inventory: number;
      DaysSinceLastSale: number;
    }>>`
      SELECT 
        s.SkuID,
        sc.Name AS CategoryName,
        s.Quantity AS Inventory,
        DATEDIFF(day, 
          (SELECT MAX(co.OrderDate) 
           FROM CustomerOrdersItems coi 
           JOIN CustomerOrders co ON co.ID = coi.CustomerOrderID 
           WHERE coi.SKU = s.SkuID),
          GETDATE()
        ) AS DaysSinceLastSale
      FROM Sku s
      JOIN SkuCategories sc ON sc.ID = s.CategoryID
      WHERE s.Quantity > 0
        AND s.ShowInPreOrder = 0
        AND sc.Name != 'Defective'
        AND DATEDIFF(day, 
          (SELECT MAX(co.OrderDate) 
           FROM CustomerOrdersItems coi 
           JOIN CustomerOrders co ON co.ID = coi.CustomerOrderID 
           WHERE coi.SKU = s.SkuID),
          GETDATE()
        ) > ${config.deadSkuDays}
      ORDER BY DaysSinceLastSale DESC
    `;
    
    for (const sku of deadSkus) {
      exceptions.push({
        type: 'dead-sku',
        entityId: sku.SkuID,
        entityName: `${sku.SkuID} (${sku.CategoryName})`,
        metric: 'Days since last sale',
        expected: `< ${config.deadSkuDays} days`,
        actual: `${sku.DaysSinceLastSale || 'Never sold'}`,
        severity: (sku.DaysSinceLastSale || 999) > config.deadSkuDays * 2 ? 'high' : 'medium',
        daysSinceTriggered: (sku.DaysSinceLastSale || 0) - config.deadSkuDays,
        actions: ['Promote in next campaign', 'Discount to move inventory', 'Consider discontinuation'],
      });
    }
  } catch (error) {
    console.warn('Dead SKUs query failed');
  }

  // 5. Hot SKUs (selling fast, may stockout)
  try {
    const hotSkus = await prisma.$queryRaw<Array<{
      SkuID: string;
      CategoryName: string;
      Inventory: number;
      SoldLast30: number;
      DaysOfSupply: number;
    }>>`
      WITH SkuVelocity AS (
        SELECT 
          s.SkuID,
          sc.Name AS CategoryName,
          s.Quantity AS Inventory,
          COALESCE((
            SELECT SUM(coi.Quantity)
            FROM CustomerOrdersItems coi
            JOIN CustomerOrders co ON co.ID = coi.CustomerOrderID
            WHERE coi.SKU = s.SkuID
              AND co.OrderDate >= DATEADD(day, -30, GETDATE())
          ), 0) AS SoldLast30,
          CASE 
            WHEN COALESCE((
              SELECT SUM(coi.Quantity)
              FROM CustomerOrdersItems coi
              JOIN CustomerOrders co ON co.ID = coi.CustomerOrderID
              WHERE coi.SKU = s.SkuID
                AND co.OrderDate >= DATEADD(day, -30, GETDATE())
            ), 0) > 0 
            THEN CAST(s.Quantity * 30.0 / (
              SELECT SUM(coi.Quantity)
              FROM CustomerOrdersItems coi
              JOIN CustomerOrders co ON co.ID = coi.CustomerOrderID
              WHERE coi.SKU = s.SkuID
                AND co.OrderDate >= DATEADD(day, -30, GETDATE())
            ) AS INT)
            ELSE 999
          END AS DaysOfSupply
        FROM Sku s
        JOIN SkuCategories sc ON sc.ID = s.CategoryID
        WHERE s.Quantity > 0
          AND s.ShowInPreOrder = 0
      )
      SELECT SkuID, CategoryName, Inventory, SoldLast30, DaysOfSupply
      FROM SkuVelocity
      WHERE DaysOfSupply < 21
      ORDER BY DaysOfSupply ASC
    `;
    
    for (const sku of hotSkus) {
      exceptions.push({
        type: 'hot-sku',
        entityId: sku.SkuID,
        entityName: `${sku.SkuID} (${sku.CategoryName})`,
        metric: 'Days of supply',
        expected: '> 30 days',
        actual: `${sku.DaysOfSupply} days (${sku.SoldLast30} sold/30d)`,
        severity: sku.DaysOfSupply < 14 ? 'high' : 'medium',
        daysSinceTriggered: 0,
        actions: ['Expedite reorder', 'Check supplier lead time', 'Consider price increase'],
      });
    }
  } catch (error) {
    console.warn('Hot SKUs query failed');
  }

  return exceptions;
}

// ============================================================================
// Cohort Retention Report
// ============================================================================

export async function getCohortRetentionReport(
  fromDate: string | null = null,
  toDate: string | null = null
): Promise<CohortRow[]> {
  try {
    // Build date filter for FirstOrderDate (sanitized to prevent SQL injection)
    const dateCondition = buildDateCondition('c.FirstOrderDate', fromDate, toDate);

    const cohorts = await prisma.$queryRawUnsafe<Array<{
      CohortMonth: string;
      Size: number;
      M1: number;
      M2: number;
      M3: number;
      M6: number;
      M12: number;
      LTV: number;
    }>>(`
      WITH CustomerCohorts AS (
        SELECT 
          c.ID AS CustomerID,
          FORMAT(c.FirstOrderDate, 'yyyy-MM') AS CohortMonth,
          c.FirstOrderDate
        FROM Customers c
        WHERE c.FirstOrderDate IS NOT NULL
          AND c.FirstOrderDate >= DATEADD(year, -2, GETDATE())
          ${dateCondition}
      ),
      MonthlyActivity AS (
        SELECT 
          cc.CustomerID,
          cc.CohortMonth,
          DATEDIFF(month, cc.FirstOrderDate, co.OrderDate) AS MonthsSinceFirst,
          co.OrderAmount
        FROM CustomerCohorts cc
        JOIN CustomerOrders co ON co.CustomerID = cc.CustomerID
      )
      SELECT 
        CohortMonth,
        COUNT(DISTINCT CustomerID) AS Size,
        CAST(COUNT(DISTINCT CASE WHEN MonthsSinceFirst = 1 THEN CustomerID END) * 100.0 / NULLIF(COUNT(DISTINCT CustomerID), 0) AS DECIMAL(5,1)) AS M1,
        CAST(COUNT(DISTINCT CASE WHEN MonthsSinceFirst = 2 THEN CustomerID END) * 100.0 / NULLIF(COUNT(DISTINCT CustomerID), 0) AS DECIMAL(5,1)) AS M2,
        CAST(COUNT(DISTINCT CASE WHEN MonthsSinceFirst = 3 THEN CustomerID END) * 100.0 / NULLIF(COUNT(DISTINCT CustomerID), 0) AS DECIMAL(5,1)) AS M3,
        CAST(COUNT(DISTINCT CASE WHEN MonthsSinceFirst = 6 THEN CustomerID END) * 100.0 / NULLIF(COUNT(DISTINCT CustomerID), 0) AS DECIMAL(5,1)) AS M6,
        CAST(COUNT(DISTINCT CASE WHEN MonthsSinceFirst = 12 THEN CustomerID END) * 100.0 / NULLIF(COUNT(DISTINCT CustomerID), 0) AS DECIMAL(5,1)) AS M12,
        SUM(OrderAmount) AS LTV
      FROM MonthlyActivity
      GROUP BY CohortMonth
      ORDER BY CohortMonth DESC
    `);
    
    return cohorts.map(c => ({
      cohortMonth: c.CohortMonth,
      size: c.Size,
      m1: c.M1 / 100,
      m2: c.M2 / 100,
      m3: c.M3 / 100,
      m6: c.M6 / 100,
      m12: c.M12 / 100,
      ltv: c.LTV,
    }));
  } catch (error) {
    console.warn('Cohort retention query failed - schema may need updating');
    return [];
  }
}

// ============================================================================
// Account Potential Report
// ============================================================================

export async function getAccountPotentialReport(
  fromDate: string | null = null,
  toDate: string | null = null
): Promise<AccountPotentialRow[]> {
  try {
    // Build date filter for LastOrderDate (sanitized to prevent SQL injection)
    const dateCondition = buildDateCondition('c.LastOrderDate', fromDate, toDate);

    // For account potential, we need to estimate what each customer COULD spend
    // This is based on segment, industry benchmarks, and peer comparison
    const accounts = await prisma.$queryRawUnsafe<Array<{
      CustomerID: number;
      StoreName: string;
      CurrentRevenue: number;
      Segment: string;
      Rep: string;
      Region: string;
    }>>(`
      SELECT 
        c.ID AS CustomerID,
        c.StoreName,
        COALESCE(c.LTV, 0) AS CurrentRevenue,
        COALESCE(c.Segment, 'Bronze') AS Segment,
        COALESCE(c.Rep, 'Unassigned') AS Rep,
        COALESCE(c.StateProvince, 'Unknown') AS Region
      FROM Customers c
      WHERE c.OrderCount > 0
        ${dateCondition}
      ORDER BY CurrentRevenue DESC
    `);
    
    // Calculate average by segment for potential estimation
    const segmentAverages: Record<string, number> = {
      Platinum: 150000,
      Gold: 75000,
      Silver: 35000,
      Bronze: 15000,
    };
    
    return accounts.map(a => {
      const segmentTarget = segmentAverages[a.Segment] || 15000;
      const estimatedPotential = Math.max(a.CurrentRevenue * 1.5, segmentTarget);
      const gap = estimatedPotential - a.CurrentRevenue;
      
      // Determine quadrant
      const currentPercent = a.CurrentRevenue / estimatedPotential;
      let quadrant: 'stars' | 'develop' | 'maintain' | 'harvest';
      
      if (currentPercent >= 0.8 && a.CurrentRevenue > segmentTarget * 0.5) {
        quadrant = 'stars';
      } else if (currentPercent < 0.5 && a.CurrentRevenue < segmentTarget * 0.3) {
        quadrant = 'develop';
      } else if (currentPercent >= 0.5) {
        quadrant = 'maintain';
      } else {
        quadrant = 'harvest';
      }
      
      return {
        customerId: a.CustomerID,
        storeName: a.StoreName,
        currentRevenue: a.CurrentRevenue,
        estimatedPotential,
        gapAmount: gap,
        quadrant,
        rep: a.Rep,
        region: a.Region,
      };
    });
  } catch (error) {
    console.warn('Account potential query failed - schema may need updating');
    return [];
  }
}

// ============================================================================
// Rep Scorecard Report
// ============================================================================

export async function getRepScorecardReport(
  fromDate: string | null = null,
  toDate: string | null = null
): Promise<RepScorecardRow[]> {
  try {
    // Sanitize dates to prevent SQL injection
    const safeFrom = sanitizeDate(fromDate);
    const safeTo = sanitizeDate(toDate);

    // Build the join condition for orders (using sanitized dates)
    const orderJoinCondition = safeFrom && safeTo 
      ? `co.OrderDate BETWEEN '${safeFrom}' AND '${safeTo}T23:59:59'`
      : safeFrom 
        ? `co.OrderDate >= '${safeFrom}'`
        : safeTo 
          ? `co.OrderDate <= '${safeTo}T23:59:59'`
          : 'co.OrderDate >= DATEADD(month, -12, GETDATE())';

    const reps = await prisma.$queryRawUnsafe<Array<{
      RepID: number;
      RepName: string;
      Territory: string;
      ActiveAccounts: number;
      Revenue: number;
      TargetAmount: number;
      NewAccounts: number;
      ReactivatedAccounts: number;
      AvgOrderValue: number;
    }>>(`
      WITH RepMetrics AS (
        SELECT 
          r.ID AS RepID,
          r.Name AS RepName,
          COALESCE(r.Territory, r.Country) AS Territory,
          COUNT(DISTINCT co.CustomerID) AS ActiveAccounts,
          SUM(co.OrderAmount) AS Revenue,
          COALESCE(rt.TargetAmount, 50000) AS TargetAmount,
          COUNT(DISTINCT CASE 
            WHEN c.FirstOrderDate >= DATEADD(month, -12, GETDATE()) 
            THEN c.ID 
          END) AS NewAccounts,
          COUNT(DISTINCT CASE 
            WHEN c.OrderCount > 1 
                 AND DATEDIFF(day, c.FirstOrderDate, c.LastOrderDate) > 180 
            THEN c.ID 
          END) AS ReactivatedAccounts,
          AVG(co.OrderAmount) AS AvgOrderValue
        FROM Reps r
        LEFT JOIN CustomerOrders co ON co.RepID = r.ID 
          AND ${orderJoinCondition}
        LEFT JOIN Customers c ON c.ID = co.CustomerID
        LEFT JOIN RepTargets rt ON rt.RepID = r.ID 
          AND rt.PeriodType = 'Annual' 
          AND rt.PeriodStart >= DATEADD(year, -1, GETDATE())
        GROUP BY r.ID, r.Name, r.Territory, r.Country, rt.TargetAmount
      )
      SELECT 
        RepID,
        RepName,
        Territory,
        ActiveAccounts,
        Revenue,
        TargetAmount,
        NewAccounts,
        ReactivatedAccounts,
        AvgOrderValue
      FROM RepMetrics
      WHERE Revenue > 0
      ORDER BY Revenue DESC
    `);
    
    // Calculate total revenue across all reps for share of potential
    const totalRevenue = reps.reduce((sum, r) => sum + (r.Revenue || 0), 0);

    // Get monthly revenue history for each rep (last 6 months)
    const revenueHistoryData = await prisma.$queryRawUnsafe<Array<{
      RepID: number;
      MonthNum: number;
      Revenue: number;
    }>>(`
      SELECT 
        r.ID AS RepID,
        DATEDIFF(month, co.OrderDate, GETDATE()) AS MonthNum,
        SUM(co.OrderAmount) AS Revenue
      FROM Reps r
      LEFT JOIN CustomerOrders co ON co.RepID = r.ID 
        AND co.OrderDate >= DATEADD(month, -6, GETDATE())
      GROUP BY r.ID, DATEDIFF(month, co.OrderDate, GETDATE())
      HAVING DATEDIFF(month, co.OrderDate, GETDATE()) BETWEEN 0 AND 5
      ORDER BY r.ID, MonthNum DESC
    `);

    // Build revenue history map: RepID -> [month5, month4, month3, month2, month1, month0]
    const revenueHistoryMap = new Map<number, number[]>();
    for (const row of revenueHistoryData) {
      if (!revenueHistoryMap.has(row.RepID)) {
        revenueHistoryMap.set(row.RepID, [0, 0, 0, 0, 0, 0]);
      }
      const history = revenueHistoryMap.get(row.RepID)!;
      // MonthNum 5 = oldest, MonthNum 0 = current month
      if (row.MonthNum >= 0 && row.MonthNum <= 5) {
        history[5 - row.MonthNum] = row.Revenue || 0;
      }
    }

    // Calculate shareOfPotential as rep's share of total revenue
    const calculateShareOfPotential = (
      rep: { Revenue: number; Territory: string | null },
    ): number => {
      if (totalRevenue === 0) return 0;
      return rep.Revenue / totalRevenue;
    };
    
    // Calculate shares
    const repsWithShares = reps.map(r => ({
      ...r,
      shareOfPotential: calculateShareOfPotential(r),
    }));
    
    // Calculate ranks
    const revenueRanked = [...reps].sort((a, b) => b.Revenue - a.Revenue);
    const targetRanked = [...reps].sort((a, b) => 
      (b.Revenue / b.TargetAmount) - (a.Revenue / a.TargetAmount)
    );
    const potentialRanked = [...repsWithShares].sort((a, b) => 
      b.shareOfPotential - a.shareOfPotential
    );
    
    return repsWithShares.map(r => ({
      repId: r.RepID,
      repName: r.RepName,
      territory: r.Territory,
      activeAccounts: r.ActiveAccounts,
      revenue: r.Revenue,
      revenueRank: revenueRanked.findIndex(x => x.RepID === r.RepID) + 1,
      targetAmount: r.TargetAmount,
      percentOfTarget: r.Revenue / r.TargetAmount,
      targetRank: targetRanked.findIndex(x => x.RepID === r.RepID) + 1,
      shareOfPotential: r.shareOfPotential,
      potentialRank: potentialRanked.findIndex(x => x.RepID === r.RepID) + 1,
      newAccounts: r.NewAccounts,
      reactivatedAccounts: r.ReactivatedAccounts,
      avgOrderValue: r.AvgOrderValue,
      revenueHistory: revenueHistoryMap.get(r.RepID) || [0, 0, 0, 0, 0, 0],
    }));
  } catch (error) {
    console.warn('Rep scorecard query failed - schema may need updating');
    return [];
  }
}

// ============================================================================
// Customer LTV Report
// ============================================================================

export async function getCustomerLTVReport(
  fromDate: string | null = null,
  toDate: string | null = null
): Promise<CustomerLTVRow[]> {
  try {
    // Build date filter for FirstOrderDate (sanitized to prevent SQL injection)
    const dateCondition = buildDateCondition('c.FirstOrderDate', fromDate, toDate);

    const customers = await prisma.$queryRawUnsafe<Array<{
      CustomerID: number;
      StoreName: string;
      Segment: string;
      LTV: number;
      OrderCount: number;
      AvgOrderValue: number;
      FirstCategory: string;
      AcquisitionRep: string;
      DaysSinceFirstOrder: number;
      DaysSinceLastOrder: number;
    }>>(`
      SELECT 
        c.ID AS CustomerID,
        c.StoreName,
        COALESCE(c.Segment, 'Bronze') AS Segment,
        COALESCE(c.LTV, 0) AS LTV,
        COALESCE(c.OrderCount, 0) AS OrderCount,
        CASE 
          WHEN c.OrderCount > 0 THEN COALESCE(c.LTV, 0) / c.OrderCount 
          ELSE 0 
        END AS AvgOrderValue,
        COALESCE((
          SELECT TOP 1 sc.Name 
          FROM CustomerOrdersItems coi
          JOIN Sku s ON s.SkuID = coi.SKU
          JOIN SkuCategories sc ON sc.ID = s.CategoryID
          JOIN CustomerOrders co ON co.ID = coi.CustomerOrderID
          WHERE co.CustomerID = c.ID
          ORDER BY co.OrderDate ASC
        ), 'Unknown') AS FirstCategory,
        COALESCE(c.Rep, 'Unassigned') AS AcquisitionRep,
        DATEDIFF(day, c.FirstOrderDate, GETDATE()) AS DaysSinceFirstOrder,
        DATEDIFF(day, c.LastOrderDate, GETDATE()) AS DaysSinceLastOrder
      FROM Customers c
      WHERE c.LTV > 0
        ${dateCondition}
      ORDER BY c.LTV DESC
    `);
    
    return customers.map(c => ({
      customerId: c.CustomerID,
      storeName: c.StoreName,
      segment: c.Segment as 'Platinum' | 'Gold' | 'Silver' | 'Bronze',
      ltv: Number(c.LTV) || 0,  // Convert Decimal to number
      orderCount: c.OrderCount,
      avgOrderValue: Number(c.AvgOrderValue) || 0,  // Convert Decimal to number
      firstCategory: c.FirstCategory,
      acquisitionRep: c.AcquisitionRep,
      daysSinceFirstOrder: c.DaysSinceFirstOrder || 0,
      daysSinceLastOrder: c.DaysSinceLastOrder || 0,
    }));
  } catch (error) {
    console.warn('Customer LTV query failed - schema may need updating');
    return [];
  }
}

// ============================================================================
// First-to-Second Conversion Report
// ============================================================================

export async function getFirstToSecondReport(
  fromDate: string | null = null,
  toDate: string | null = null
): Promise<FirstToSecondRow[]> {
  try {
    // Build date filter for FirstOrderDate (sanitized to prevent SQL injection)
    const dateCondition = buildDateCondition('c.FirstOrderDate', fromDate, toDate);

    const cohorts = await prisma.$queryRawUnsafe<Array<{
      CohortMonth: string;
      NewCustomers: number;
      ConvertedCustomers: number;
      AvgDaysToSecond: number;
      FirstOrderAOV: number;
      SecondOrderAOV: number;
    }>>(`
      WITH FirstOrders AS (
        SELECT 
          c.ID AS CustomerID,
          FORMAT(c.FirstOrderDate, 'yyyy-MM') AS CohortMonth,
          c.FirstOrderDate,
          (SELECT TOP 1 co.OrderAmount 
           FROM CustomerOrders co 
           WHERE co.CustomerID = c.ID 
           ORDER BY co.OrderDate ASC) AS FirstOrderAmount
        FROM Customers c
        WHERE c.FirstOrderDate IS NOT NULL
          AND c.FirstOrderDate >= DATEADD(year, -2, GETDATE())
          ${dateCondition}
      ),
      SecondOrders AS (
        SELECT 
          fo.CustomerID,
          fo.CohortMonth,
          (SELECT TOP 1 co.OrderDate 
           FROM CustomerOrders co 
           WHERE co.CustomerID = fo.CustomerID 
           ORDER BY co.OrderDate ASC 
           OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY) AS SecondOrderDate,
          (SELECT TOP 1 co.OrderAmount 
           FROM CustomerOrders co 
           WHERE co.CustomerID = fo.CustomerID 
           ORDER BY co.OrderDate ASC 
           OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY) AS SecondOrderAmount
        FROM FirstOrders fo
      )
      SELECT 
        fo.CohortMonth,
        COUNT(*) AS NewCustomers,
        COUNT(so.SecondOrderDate) AS ConvertedCustomers,
        AVG(DATEDIFF(day, fo.FirstOrderDate, so.SecondOrderDate)) AS AvgDaysToSecond,
        AVG(fo.FirstOrderAmount) AS FirstOrderAOV,
        AVG(so.SecondOrderAmount) AS SecondOrderAOV
      FROM FirstOrders fo
      LEFT JOIN SecondOrders so ON so.CustomerID = fo.CustomerID
      GROUP BY fo.CohortMonth
      ORDER BY fo.CohortMonth DESC
    `);
    
    return cohorts.map(c => ({
      cohortMonth: c.CohortMonth,
      newCustomers: c.NewCustomers,
      convertedCustomers: c.ConvertedCustomers,
      conversionRate: c.NewCustomers > 0 ? c.ConvertedCustomers / c.NewCustomers : 0,
      avgDaysToSecond: c.AvgDaysToSecond || 0,
      firstOrderAOV: c.FirstOrderAOV || 0,
      secondOrderAOV: c.SecondOrderAOV || 0,
      aovLift: c.FirstOrderAOV > 0 ? (c.SecondOrderAOV - c.FirstOrderAOV) / c.FirstOrderAOV : 0,
    }));
  } catch (error) {
    console.warn('First-to-second query failed - schema may need updating');
    return [];
  }
}

// ============================================================================
// At-Risk Accounts (for Dashboard Widget)
// ============================================================================

export interface AtRiskAccount {
  customerId: number;
  storeName: string;
  segment: string;
  ltv: number;
  daysSinceLastOrder: number;
  usualOrderCycle: number | null;
  rep: string;
  riskReason: string;
}

export async function getAtRiskAccounts(
  lateDays: number = 60,
  limit: number = 5
): Promise<AtRiskAccount[]> {
  try {
    // Use c.Rep (string field) - Customers table has Rep as text, not RepID as FK
    const accounts = await prisma.$queryRawUnsafe<Array<{
      CustomerID: number;
      StoreName: string;
      Segment: string;
      LTV: number;
      DaysSinceLast: number;
      UsualCycle: number | null;
      Rep: string;
    }>>(`
      SELECT TOP ${limit}
        c.ID AS CustomerID,
        c.StoreName,
        COALESCE(c.Segment, 'Unknown') AS Segment,
        COALESCE(c.LTV, 0) AS LTV,
        DATEDIFF(day, c.LastOrderDate, GETDATE()) AS DaysSinceLast,
        c.UsualOrderCycle AS UsualCycle,
        COALESCE(c.Rep, 'Unassigned') AS Rep
      FROM Customers c
      WHERE c.LastOrderDate IS NOT NULL
        AND DATEDIFF(day, c.LastOrderDate, GETDATE()) > ${lateDays}
        AND c.OrderCount > 0
      ORDER BY DaysSinceLast DESC
    `);

    return accounts.map(a => {
      const expected = a.UsualCycle || lateDays;
      return {
        customerId: a.CustomerID,
        storeName: a.StoreName,
        segment: a.Segment,
        ltv: Number(a.LTV) || 0,  // Convert Decimal to number
        daysSinceLastOrder: a.DaysSinceLast,
        usualOrderCycle: a.UsualCycle,
        rep: a.Rep,
        riskReason: `${a.DaysSinceLast} days (expected < ${expected} days)`,
      };
    });
  } catch (error) {
    console.warn('At-risk accounts query failed - schema may need updating');
    return [];
  }
}
