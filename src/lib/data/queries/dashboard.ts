/**
 * Dashboard queries - data layer for admin dashboard
 * Matches .NET behavior for parity
 */

import { prisma } from '@/lib/prisma';
import { getEffectiveQuantity, getBaseSku } from '@/lib/utils';
import {
  type TimePeriod,
  type DateRange,
  type DashboardMetrics,
  type TrendDirection,
  type CategoryTotal,
  type CategoryTotalsResult,
  type POSoldRawRow,
  type POSoldRow,
  getDateRangeForPeriod,
  getPriorPeriodRange,
  getTrendDirection,
  getSizeBucketKey,
  normalizeSizeToBucket,
  createEmptyPOSoldRow,
} from '../mappers/dashboard';

// ============================================================================
// Dashboard Metrics Queries
// ============================================================================

/**
 * Get orders count for a time period
 */
export async function getOrdersCount(
  period: TimePeriod,
  customRange?: DateRange
): Promise<number> {
  const { start, end } = getDateRangeForPeriod(period, customRange);
  
  const count = await prisma.customerOrders.count({
    where: {
      OrderDate: {
        gte: start,
        lte: end,
      },
    },
  });
  
  return count;
}

/**
 * Get total revenue for a time period
 */
export async function getRevenue(
  period: TimePeriod,
  customRange?: DateRange
): Promise<number> {
  const { start, end } = getDateRangeForPeriod(period, customRange);
  
  const result = await prisma.customerOrders.aggregate({
    where: {
      OrderDate: {
        gte: start,
        lte: end,
      },
    },
    _sum: {
      OrderAmount: true,
    },
  });
  
  return result._sum.OrderAmount ?? 0;
}

/**
 * Get total units in stock (ATS only, excluding Defective)
 * Matches .NET Report.aspx logic with prepack multiplier
 */
export async function getUnitsInStock(): Promise<number> {
  const skus = await prisma.sku.findMany({
    where: {
      Quantity: { gt: 0 },
      ShowInPreOrder: false, // ATS only
      SkuCategories: {
        Name: { not: 'Defective' },
      },
    },
    select: {
      SkuID: true,
      Quantity: true,
    },
  });
  
  // Apply prepack multiplier and sum
  return skus.reduce((sum, sku) => {
    const effectiveQty = getEffectiveQuantity(sku.SkuID, sku.Quantity ?? 0);
    return sum + effectiveQty;
  }, 0);
}

/**
 * Get count of orders pending Shopify sync
 * These are orders where IsTransferredToShopify = false or null
 */
export async function getPendingSyncCount(): Promise<number> {
  const count = await prisma.customerOrders.count({
    where: {
      OR: [
        { IsTransferredToShopify: false },
        { IsTransferredToShopify: null },
      ],
    },
  });
  
  return count;
}

/**
 * Calculate percentage change between two values
 */
function calculatePercentChange(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return ((current - prior) / prior) * 100;
}

/**
 * Get orders count for a specific date range
 */
async function getOrdersCountForRange(range: DateRange): Promise<number> {
  const count = await prisma.customerOrders.count({
    where: {
      OrderDate: {
        gte: range.start,
        lte: range.end,
      },
    },
  });
  return count;
}

/**
 * Get revenue for a specific date range
 */
async function getRevenueForRange(range: DateRange): Promise<number> {
  const result = await prisma.customerOrders.aggregate({
    where: {
      OrderDate: {
        gte: range.start,
        lte: range.end,
      },
    },
    _sum: {
      OrderAmount: true,
    },
  });
  return result._sum.OrderAmount ?? 0;
}

/**
 * Get all dashboard metrics at once with trend comparison
 */
export async function getDashboardMetrics(
  period: TimePeriod,
  customRange?: DateRange
): Promise<DashboardMetrics> {
  const currentRange = getDateRangeForPeriod(period, customRange);
  const priorRange = getPriorPeriodRange(currentRange);

  // Run all queries in parallel for both current and prior periods
  const [
    currentOrders,
    priorOrders,
    currentRevenue,
    priorRevenue,
    unitsInStock,
    pendingSyncCount,
  ] = await Promise.all([
    getOrdersCountForRange(currentRange),
    getOrdersCountForRange(priorRange),
    getRevenueForRange(currentRange),
    getRevenueForRange(priorRange),
    getUnitsInStock(),
    getPendingSyncCount(),
  ]);

  // Calculate percentage changes
  const ordersChange = calculatePercentChange(currentOrders, priorOrders);
  const revenueChange = calculatePercentChange(currentRevenue, priorRevenue);
  // Stock change is 0 since we don't have prior stock data readily available
  const stockChange = 0;

  return {
    ordersCount: currentOrders,
    ordersChange,
    ordersTrend: getTrendDirection(ordersChange),
    revenue: currentRevenue,
    revenueChange,
    revenueTrend: getTrendDirection(revenueChange),
    unitsInStock,
    stockChange,
    stockTrend: 'flat' as TrendDirection,
    pendingSyncCount,
  };
}

// ============================================================================
// Category Totals Query (matches .NET Report.aspx)
// ============================================================================

/**
 * Get category totals with main/sub category grouping
 * Matches .NET Report.aspx logic:
 * - Exclude "Defective" category
 * - Only count Quantity > 0
 * - Apply prepack multiplier
 * - Group by Main Category → Sub Category
 */
export async function getCategoryTotals(): Promise<CategoryTotalsResult> {
  // Fetch SKUs with category hierarchy
  const skus = await prisma.sku.findMany({
    where: {
      Quantity: { gt: 0 },
      ShowInPreOrder: false, // ATS only (matches .NET isPreOrder = false)
      SkuCategories: {
        Name: { not: 'Defective' },
      },
    },
    select: {
      SkuID: true,
      Quantity: true,
      SkuCategories: {
        select: {
          Name: true,
          SkuMainSubRship: {
            select: {
              SkuMainCategory: {
                select: {
                  Name: true,
                },
              },
            },
          },
        },
      },
    },
  });
  
  // Aggregate in memory (matches .NET pattern)
  const totalsMap = new Map<string, CategoryTotal>();
  let grandTotal = 0;
  
  for (const sku of skus) {
    const effectiveQty = getEffectiveQuantity(sku.SkuID, sku.Quantity ?? 0);
    grandTotal += effectiveQty;
    
    const subCategory = sku.SkuCategories?.Name ?? 'Unknown';
    
    // Get main category from relationship (first one if multiple)
    const mainCatRship = sku.SkuCategories?.SkuMainSubRship?.[0];
    const mainCategory = mainCatRship?.SkuMainCategory?.Name ?? 'Uncategorized';
    
    const key = `${mainCategory}|${subCategory}`;
    
    const existing = totalsMap.get(key);
    if (existing) {
      existing.quantity += effectiveQty;
    } else {
      totalsMap.set(key, {
        mainCategory,
        subCategory,
        quantity: effectiveQty,
      });
    }
  }
  
  // Convert to array and sort by main category, then sub category
  const items = Array.from(totalsMap.values()).sort((a, b) => {
    const mainCompare = a.mainCategory.localeCompare(b.mainCategory);
    if (mainCompare !== 0) return mainCompare;
    return a.subCategory.localeCompare(b.subCategory);
  });
  
  return { items, grandTotal };
}

// ============================================================================
// PO Sold Query (matches .NET POSoldReport.aspx + stored procedure)
// ============================================================================

/**
 * Get PO Sold report data
 * Uses raw SQL to match .NET stored procedure [dbo].[uspGetSKUsForPOSoldReport]
 * 
 * The .NET stored procedure:
 * - Joins RawSkusFromShopify → RawSkusInventoryLevelFromShopify (cast ParentId to bigint)
 * - Joins to Sku via ShopifyProductVariantId = ShopifyId
 * - Groups by SkuID, CategoryID
 * - Sums CommittedQuantity
 */
export async function getPOSoldData(): Promise<POSoldRow[]> {
  // Use raw SQL to match .NET stored procedure exactly
  const rawResults = await prisma.$queryRaw<POSoldRawRow[]>`
    SELECT
      S.SkuID AS SKU,
      S.Size AS Size,
      S.CategoryID AS CategoryID,
      CONCAT(SC.Name, ' (', CASE WHEN SC.IsPreOrder = 1 THEN 'PreOrder' ELSE 'ATS' END, ')') AS CategoryName,
      CAST(COALESCE(SUM(RIL.CommittedQuantity), 0) AS INT) AS Quantity
    FROM RawSkusFromShopify RS
    JOIN RawSkusInventoryLevelFromShopify RIL
      ON CAST(RIL.ParentId AS BIGINT) = RS.ShopifyId
    JOIN Sku S
      ON S.ShopifyProductVariantId = RS.ShopifyId
    JOIN SkuCategories SC
      ON SC.ID = S.CategoryID
    GROUP BY S.SkuID, S.Size, S.CategoryID, SC.Name, SC.IsPreOrder
    ORDER BY S.CategoryID, S.SkuID
  `;
  
  // Now aggregate into size buckets (matches .NET POSoldReport.aspx.cs logic)
  const rowMap = new Map<string, POSoldRow>();
  
  for (const raw of rawResults) {
    // Extract base SKU using the Size field for accurate parsing
    const baseSku = getBaseSku(raw.SKU, raw.Size);
    const key = `${baseSku}|${raw.CategoryName}`;

    // Get or create row
    let row = rowMap.get(key);
    if (!row) {
      row = createEmptyPOSoldRow(baseSku, raw.CategoryName);
      rowMap.set(key, row);
    }

    // Determine which size bucket this goes into (use Size field directly)
    const normalizedSize = normalizeSizeToBucket(raw.Size);
    if (normalizedSize) {
      const bucketKey = getSizeBucketKey(normalizedSize);
      if (bucketKey && bucketKey !== 'sku' && bucketKey !== 'categoryName' && bucketKey !== 'total') {
        (row[bucketKey] as number) += raw.Quantity;
      }
    }
    
    // Always add to total
    row.total += raw.Quantity;
  }
  
  // Convert to array and sort
  return Array.from(rowMap.values()).sort((a, b) => {
    const catCompare = a.categoryName.localeCompare(b.categoryName);
    if (catCompare !== 0) return catCompare;
    return a.sku.localeCompare(b.sku);
  });
}

/**
 * Get PO Sold grand total
 */
export async function getPOSoldGrandTotal(): Promise<number> {
  const result = await prisma.$queryRaw<[{ total: number }]>`
    SELECT CAST(COALESCE(SUM(RIL.CommittedQuantity), 0) AS INT) AS total
    FROM RawSkusFromShopify RS
    JOIN RawSkusInventoryLevelFromShopify RIL 
      ON CAST(RIL.ParentId AS BIGINT) = RS.ShopifyId
    JOIN Sku S 
      ON S.ShopifyProductVariantId = RS.ShopifyId
  `;
  
  return result[0]?.total ?? 0;
}
