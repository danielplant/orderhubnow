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
  thresholds: Partial<ExceptionThresholds> = {}
): Promise<ExceptionRow[]> {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const exceptions: ExceptionRow[] = [];
  const now = new Date();
  
  // 1. Late Accounts (customers who haven't ordered in X days)
  // Requires: CustomerOrders with CustomerID FK populated
  try {
    const lateAccounts = await prisma.$queryRaw<Array<{
      CustomerID: number;
      StoreName: string;
      LastOrderDate: Date;
      DaysSinceLast: number;
      UsualCycle: number | null;
    }>>`
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
      ORDER BY DaysSinceLast DESC
    `;
    
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
      HAVING DaysOfSupply < 21
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

export async function getCohortRetentionReport(): Promise<CohortRow[]> {
  try {
    const cohorts = await prisma.$queryRaw<Array<{
      CohortMonth: string;
      Size: number;
      M1: number;
      M2: number;
      M3: number;
      M6: number;
      M12: number;
      LTV: number;
    }>>`
      WITH CustomerCohorts AS (
        SELECT 
          c.ID AS CustomerID,
          FORMAT(c.FirstOrderDate, 'yyyy-MM') AS CohortMonth,
          c.FirstOrderDate
        FROM Customers c
        WHERE c.FirstOrderDate IS NOT NULL
          AND c.FirstOrderDate >= DATEADD(year, -2, GETDATE())
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
    `;
    
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

export async function getAccountPotentialReport(): Promise<AccountPotentialRow[]> {
  try {
    // For account potential, we need to estimate what each customer COULD spend
    // This is based on segment, industry benchmarks, and peer comparison
    const accounts = await prisma.$queryRaw<Array<{
      CustomerID: number;
      StoreName: string;
      CurrentRevenue: number;
      Segment: string;
      Rep: string;
      Region: string;
    }>>`
      SELECT 
        c.ID AS CustomerID,
        c.StoreName,
        COALESCE(c.LTV, 0) AS CurrentRevenue,
        COALESCE(c.Segment, 'Bronze') AS Segment,
        COALESCE(c.Rep, 'Unassigned') AS Rep,
        COALESCE(c.StateProvince, 'Unknown') AS Region
      FROM Customers c
      WHERE c.OrderCount > 0
      ORDER BY CurrentRevenue DESC
    `;
    
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

export async function getRepScorecardReport(): Promise<RepScorecardRow[]> {
  try {
    const reps = await prisma.$queryRaw<Array<{
      RepID: number;
      RepName: string;
      Territory: string;
      ActiveAccounts: number;
      Revenue: number;
      TargetAmount: number;
      NewAccounts: number;
      ReactivatedAccounts: number;
      AvgOrderValue: number;
    }>>`
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
          AND co.OrderDate >= DATEADD(month, -12, GETDATE())
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
    `;
    
    // Get all customers with potential for territory calculation
    const customersWithPotential = await prisma.$queryRaw<Array<{
      StateProvince: string | null;
      Country: string | null;
      EstimatedPotential: number | null;
      LTV: number | null;
    }>>`
      SELECT StateProvince, Country, EstimatedPotential, LTV
      FROM Customers
      WHERE LTV > 0 OR EstimatedPotential > 0
    `;

    // Calculate shareOfPotential for each rep
    const calculateShareOfPotential = (
      rep: { Revenue: number; Territory: string | null },
    ): number => {
      const territory = rep.Territory || 'Unknown';
      
      // Find customers in rep's territory (match by StateProvince or Country)
      const territoryCustomers = customersWithPotential.filter(c => 
        c.StateProvince === territory || c.Country === territory
      );
      
      const territoryPotential = territoryCustomers.reduce((sum, c) => {
        // Use EstimatedPotential if available, otherwise 1.5x LTV
        const potential = c.EstimatedPotential || (c.LTV ? c.LTV * 1.5 : 0);
        return sum + potential;
      }, 0);
      
      if (territoryPotential === 0) return 0;
      return rep.Revenue / territoryPotential;
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
    }));
  } catch (error) {
    console.warn('Rep scorecard query failed - schema may need updating');
    return [];
  }
}

// ============================================================================
// Customer LTV Report
// ============================================================================

export async function getCustomerLTVReport(): Promise<CustomerLTVRow[]> {
  try {
    const customers = await prisma.$queryRaw<Array<{
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
    }>>`
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
      ORDER BY c.LTV DESC
    `;
    
    return customers.map(c => ({
      customerId: c.CustomerID,
      storeName: c.StoreName,
      segment: c.Segment as 'Platinum' | 'Gold' | 'Silver' | 'Bronze',
      ltv: c.LTV,
      orderCount: c.OrderCount,
      avgOrderValue: c.AvgOrderValue,
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

export async function getFirstToSecondReport(): Promise<FirstToSecondRow[]> {
  try {
    const cohorts = await prisma.$queryRaw<Array<{
      CohortMonth: string;
      NewCustomers: number;
      ConvertedCustomers: number;
      AvgDaysToSecond: number;
      FirstOrderAOV: number;
      SecondOrderAOV: number;
    }>>`
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
    `;
    
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
