/**
 * Reports API Route
 * ============================================================================
 * Fetches report data with filtering, sorting, and pagination.
 * Path: src/app/api/reports/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/providers';
import { prisma } from '@/lib/prisma';
import { getEffectiveQuantity } from '@/lib/utils';
import type { ReportType, FilterState } from '@/lib/types/report';
import {
  parseSizeFromSku,
  getSizeBucketKey,
  createEmptyPOSoldRow,
} from '@/lib/data/mappers/dashboard';

// ============================================================================
// Helper Types
// ============================================================================

interface ReportResult {
  data: unknown[];
  totalCount: number;
  filterOptions?: Record<string, Array<{ value: string; label: string }>>;
}

// ============================================================================
// Report Data Fetchers
// ============================================================================

async function getCategoryTotalsReport(
  filters: FilterState[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number
): Promise<ReportResult> {
  // Fetch SKUs with category hierarchy
  const skus = await prisma.sku.findMany({
    where: {
      Quantity: { gt: 0 },
      ShowInPreOrder: false,
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

  // Aggregate in memory
  const totalsMap = new Map<
    string,
    { mainCategory: string; subCategory: string; quantity: number; skuCount: number }
  >();

  for (const sku of skus) {
    const effectiveQty = getEffectiveQuantity(sku.SkuID, sku.Quantity ?? 0);
    const subCategory = sku.SkuCategories?.Name ?? 'Unknown';
    const mainCatRship = sku.SkuCategories?.SkuMainSubRship?.[0];
    const mainCategory = mainCatRship?.SkuMainCategory?.Name ?? 'Uncategorized';
    const key = `${mainCategory}|${subCategory}`;

    const existing = totalsMap.get(key);
    if (existing) {
      existing.quantity += effectiveQty;
      existing.skuCount += 1;
    } else {
      totalsMap.set(key, {
        mainCategory,
        subCategory,
        quantity: effectiveQty,
        skuCount: 1,
      });
    }
  }

  // Convert to array
  let items = Array.from(totalsMap.values());

  // Apply filters
  for (const filter of filters) {
    if (filter.fieldId === 'mainCategory' && filter.value) {
      if (filter.operator === 'eq') {
        items = items.filter((i) => i.mainCategory === filter.value);
      } else if (filter.operator === 'neq') {
        items = items.filter((i) => i.mainCategory !== filter.value);
      }
    }
  }

  // Sort
  if (sortBy) {
    items.sort((a, b) => {
      const av = a[sortBy as keyof typeof a];
      const bv = b[sortBy as keyof typeof b];
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  } else {
    // Default sort by main category, then sub category
    items.sort((a, b) => {
      const mainCompare = a.mainCategory.localeCompare(b.mainCategory);
      if (mainCompare !== 0) return mainCompare;
      return a.subCategory.localeCompare(b.subCategory);
    });
  }

  const totalCount = items.length;

  // Paginate
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

  // Get filter options
  const mainCategories = Array.from(new Set(items.map((i) => i.mainCategory))).sort();
  const filterOptions = {
    mainCategory: mainCategories.map((c) => ({ value: c, label: c })),
  };

  return { data: pageData, totalCount, filterOptions };
}

async function getPOSoldReport(
  filters: FilterState[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number
): Promise<ReportResult> {
  interface POSoldRawRow {
    SKU: string;
    CategoryID: number | null;
    CategoryName: string;
    Quantity: number;
  }

  // Use raw SQL to match .NET stored procedure
  const rawResults = await prisma.$queryRaw<POSoldRawRow[]>`
    SELECT
      S.SkuID AS SKU,
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
    GROUP BY S.SkuID, S.CategoryID, SC.Name, SC.IsPreOrder
    ORDER BY S.CategoryID, S.SkuID
  `;

  // Aggregate into size buckets
  const rowMap = new Map<
    string,
    {
      sku: string;
      categoryName: string;
      size2: number;
      size3: number;
      size4: number;
      size5: number;
      size6: number;
      size7: number;
      size8: number;
      size10: number;
      size12: number;
      size14: number;
      size16: number;
      sizeOS: number;
      total: number;
    }
  >();

  for (const raw of rawResults) {
    const parts = raw.SKU.split('-');
    const baseSku = parts.length > 1 ? parts.slice(0, -1).join('-') : raw.SKU;
    const key = `${baseSku}|${raw.CategoryName}`;

    let row = rowMap.get(key);
    if (!row) {
      row = {
        sku: baseSku,
        categoryName: raw.CategoryName,
        size2: 0,
        size3: 0,
        size4: 0,
        size5: 0,
        size6: 0,
        size7: 0,
        size8: 0,
        size10: 0,
        size12: 0,
        size14: 0,
        size16: 0,
        sizeOS: 0,
        total: 0,
      };
      rowMap.set(key, row);
    }

    const size = parseSizeFromSku(raw.SKU);
    if (size) {
      const bucketKey = getSizeBucketKey(size);
      if (bucketKey && bucketKey in row && bucketKey !== 'sku' && bucketKey !== 'categoryName' && bucketKey !== 'total') {
        (row as Record<string, number>)[bucketKey] += raw.Quantity;
      }
    }
    row.total += raw.Quantity;
  }

  let items = Array.from(rowMap.values());

  // Apply filters
  for (const filter of filters) {
    if (filter.fieldId === 'categoryName' && filter.value) {
      const val = String(filter.value).toLowerCase();
      if (filter.operator === 'eq') {
        items = items.filter((i) => i.categoryName.toLowerCase() === val);
      } else if (filter.operator === 'contains') {
        items = items.filter((i) => i.categoryName.toLowerCase().includes(val));
      }
    }
  }

  // Sort
  if (sortBy) {
    items.sort((a, b) => {
      const av = a[sortBy as keyof typeof a];
      const bv = b[sortBy as keyof typeof b];
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  } else {
    items.sort((a, b) => {
      const catCompare = a.categoryName.localeCompare(b.categoryName);
      if (catCompare !== 0) return catCompare;
      return a.sku.localeCompare(b.sku);
    });
  }

  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

  const categoryNames = Array.from(new Set(items.map((i) => i.categoryName))).sort();
  const filterOptions = {
    categoryName: categoryNames.map((c) => ({ value: c, label: c })),
  };

  return { data: pageData, totalCount, filterOptions };
}

async function getSKUVelocityReport(
  filters: FilterState[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number
): Promise<ReportResult> {
  // Get SKUs with current inventory
  const skus = await prisma.sku.findMany({
    where: {
      Quantity: { gt: 0 },
      ShowInPreOrder: false,
      SkuCategories: {
        Name: { not: 'Defective' },
      },
    },
    select: {
      SkuID: true,
      Quantity: true,
      CategoryID: true,
      SkuCategories: {
        select: {
          Name: true,
        },
      },
    },
  });

  // Get sales data for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const salesData = await prisma.customerOrdersItems.groupBy({
    by: ['SKU'],
    _sum: {
      Quantity: true,
    },
    where: {
      CustomerOrderID: {
        in: await prisma.customerOrders
          .findMany({
            where: {
              OrderDate: { gte: thirtyDaysAgo },
            },
            select: { ID: true },
          })
          .then((orders) => orders.map((o) => Number(o.ID))),
      },
    },
  });

  const salesMap = new Map(
    salesData.map((s) => [s.SKU, s._sum.Quantity ?? 0])
  );

  // Build velocity data
  let items = skus.map((sku) => {
    const inventory = getEffectiveQuantity(sku.SkuID, sku.Quantity ?? 0);
    const unitsSold30d = salesMap.get(sku.SkuID) ?? 0;
    const dailyVelocity = unitsSold30d / 30;
    const daysOfSupply = dailyVelocity > 0 ? Math.round(inventory / dailyVelocity) : 999;

    // Determine health score
    let healthScore: string;
    let recommendedAction: string;
    if (daysOfSupply < 14) {
      healthScore = 'reorder-now';
      recommendedAction = 'Place order immediately';
    } else if (daysOfSupply < 30) {
      healthScore = 'reorder-soon';
      recommendedAction = 'Plan reorder this week';
    } else if (daysOfSupply < 90) {
      healthScore = 'monitor';
      recommendedAction = 'No action needed';
    } else if (daysOfSupply < 180) {
      healthScore = 'overstock';
      recommendedAction = 'Consider promotion';
    } else {
      healthScore = 'discontinue';
      recommendedAction = 'Review for discontinuation';
    }

    // Simple trend (would need historical data for real implementation)
    const trend = unitsSold30d > 10 ? 'up' : unitsSold30d > 0 ? 'flat' : 'down';

    return {
      sku: sku.SkuID,
      category: sku.SkuCategories?.Name ?? 'Unknown',
      inventory,
      unitsSold30d,
      dailyVelocity: Math.round(dailyVelocity * 10) / 10,
      daysOfSupply,
      trend,
      healthScore,
      recommendedAction,
    };
  });

  // Apply filters
  for (const filter of filters) {
    if (filter.fieldId === 'healthScore' && filter.value) {
      items = items.filter((i) => i.healthScore === filter.value);
    }
    if (filter.fieldId === 'category' && filter.value) {
      const val = String(filter.value).toLowerCase();
      if (filter.operator === 'eq') {
        items = items.filter((i) => i.category.toLowerCase() === val);
      } else if (filter.operator === 'contains') {
        items = items.filter((i) => i.category.toLowerCase().includes(val));
      }
    }
  }

  // Sort
  if (sortBy) {
    items.sort((a, b) => {
      const av = a[sortBy as keyof typeof a];
      const bv = b[sortBy as keyof typeof b];
      if (av === bv) return 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  } else {
    // Default: most critical first (lowest daysOfSupply)
    items.sort((a, b) => a.daysOfSupply - b.daysOfSupply);
  }

  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

  const categories = Array.from(new Set(items.map((i) => i.category))).sort();
  const filterOptions = {
    category: categories.map((c) => ({ value: c, label: c })),
    healthScore: [
      { value: 'reorder-now', label: 'Reorder Now' },
      { value: 'reorder-soon', label: 'Reorder Soon' },
      { value: 'monitor', label: 'Monitor' },
      { value: 'overstock', label: 'Overstock' },
      { value: 'discontinue', label: 'Discontinue' },
    ],
  };

  return { data: pageData, totalCount, filterOptions };
}

// Placeholder for schema-dependent reports
async function getSchemaRequiredReport(reportType: ReportType): Promise<ReportResult> {
  return {
    data: [],
    totalCount: 0,
    filterOptions: {},
  };
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: NextRequest) {
  // Auth check
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    
    const reportType = (searchParams.get('type') || 'category-totals') as ReportType;
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize')) || 25));
    const sortBy = searchParams.get('sortBy');
    const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc';
    
    let filters: FilterState[] = [];
    const filtersParam = searchParams.get('filters');
    if (filtersParam) {
      try {
        filters = JSON.parse(decodeURIComponent(filtersParam));
      } catch {
        // Ignore invalid filters
      }
    }

    let result: ReportResult;

    switch (reportType) {
      case 'category-totals':
        result = await getCategoryTotalsReport(filters, sortBy, sortDir, page, pageSize);
        break;
      case 'po-sold':
        result = await getPOSoldReport(filters, sortBy, sortDir, page, pageSize);
        break;
      case 'sku-velocity':
        result = await getSKUVelocityReport(filters, sortBy, sortDir, page, pageSize);
        break;
      case 'exception':
      case 'cohort-retention':
      case 'account-potential':
      case 'rep-scorecard':
      case 'customer-ltv':
      case 'first-to-second':
        // These require schema changes - return empty for now
        result = await getSchemaRequiredReport(reportType);
        break;
      default:
        return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Reports API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
