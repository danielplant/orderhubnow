/**
 * Reports API Route - Complete Implementation
 * ============================================================================
 * Fetches report data with filtering, sorting, and pagination.
 * This is the complete version with all 9 reports.
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
} from '@/lib/data/mappers/dashboard';
import {
  getExceptionReport,
  getCohortRetentionReport,
  getAccountPotentialReport,
  getRepScorecardReport,
  getCustomerLTVReport,
  getFirstToSecondReport,
} from '@/lib/data/queries/reports';

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

  let items = Array.from(totalsMap.values());

  for (const filter of filters) {
    if (filter.fieldId === 'mainCategory' && filter.value) {
      if (filter.operator === 'eq') {
        items = items.filter((i) => i.mainCategory === filter.value);
      } else if (filter.operator === 'neq') {
        items = items.filter((i) => i.mainCategory !== filter.value);
      }
    }
  }

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
      const mainCompare = a.mainCategory.localeCompare(b.mainCategory);
      if (mainCompare !== 0) return mainCompare;
      return a.subCategory.localeCompare(b.subCategory);
    });
  }

  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

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
        size2: 0, size3: 0, size4: 0, size5: 0, size6: 0, size7: 0,
        size8: 0, size10: 0, size12: 0, size14: 0, size16: 0, sizeOS: 0,
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

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const orders = await prisma.customerOrders.findMany({
    where: { OrderDate: { gte: thirtyDaysAgo } },
    select: { ID: true },
  });
  const orderIds = orders.map((o) => Number(o.ID));

  const salesData = await prisma.customerOrdersItems.groupBy({
    by: ['SKU'],
    _sum: { Quantity: true },
    where: {
      CustomerOrderID: { in: orderIds },
    },
  });

  const salesMap = new Map(
    salesData.map((s) => [s.SKU, s._sum.Quantity ?? 0])
  );

  let items = skus.map((sku) => {
    const inventory = getEffectiveQuantity(sku.SkuID, sku.Quantity ?? 0);
    const unitsSold30d = salesMap.get(sku.SkuID) ?? 0;
    const dailyVelocity = unitsSold30d / 30;
    const daysOfSupply = dailyVelocity > 0 ? Math.round(inventory / dailyVelocity) : 999;

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

async function getExceptionReportData(
  filters: FilterState[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number
): Promise<ReportResult> {
  let items = await getExceptionReport();
  
  for (const filter of filters) {
    if (filter.fieldId === 'type' && filter.value) {
      items = items.filter((i) => i.type === filter.value);
    }
    if (filter.fieldId === 'severity' && filter.value) {
      items = items.filter((i) => i.severity === filter.value);
    }
  }

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
    // Default: severity high > medium > low, then by days
    const severityOrder = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => {
      const aSev = severityOrder[a.severity];
      const bSev = severityOrder[b.severity];
      if (aSev !== bSev) return aSev - bSev;
      return b.daysSinceTriggered - a.daysSinceTriggered;
    });
  }

  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

  const filterOptions = {
    type: [
      { value: 'late-account', label: 'Late Account' },
      { value: 'declining-account', label: 'Declining Account' },
      { value: 'stalled-new-account', label: 'Stalled New Account' },
      { value: 'dead-sku', label: 'Dead SKU' },
      { value: 'hot-sku', label: 'Hot SKU' },
      { value: 'underperforming-rep', label: 'Underperforming Rep' },
    ],
    severity: [
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
    ],
  };

  return { data: pageData, totalCount, filterOptions };
}

async function getCohortRetentionReportData(
  page: number,
  pageSize: number
): Promise<ReportResult> {
  const items = await getCohortRetentionReport();
  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);
  return { data: pageData, totalCount };
}

async function getAccountPotentialReportData(
  filters: FilterState[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number
): Promise<ReportResult> {
  let items = await getAccountPotentialReport();

  for (const filter of filters) {
    if (filter.fieldId === 'quadrant' && filter.value) {
      items = items.filter((i) => i.quadrant === filter.value);
    }
    if (filter.fieldId === 'rep' && filter.value) {
      items = items.filter((i) => i.rep === filter.value);
    }
  }

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
  }

  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

  const reps = Array.from(new Set(items.map((i) => i.rep))).sort();
  const filterOptions = {
    quadrant: [
      { value: 'stars', label: 'Stars' },
      { value: 'develop', label: 'Develop' },
      { value: 'maintain', label: 'Maintain' },
      { value: 'harvest', label: 'Harvest' },
    ],
    rep: reps.map((r) => ({ value: r, label: r })),
  };

  return { data: pageData, totalCount, filterOptions };
}

async function getRepScorecardReportData(
  filters: FilterState[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number
): Promise<ReportResult> {
  let items = await getRepScorecardReport();

  for (const filter of filters) {
    if (filter.fieldId === 'territory' && filter.value) {
      items = items.filter((i) => i.territory === filter.value);
    }
  }

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
  }

  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

  const territories = Array.from(new Set(items.map((i) => i.territory))).sort();
  const filterOptions = {
    territory: territories.map((t) => ({ value: t, label: t })),
  };

  return { data: pageData, totalCount, filterOptions };
}

async function getCustomerLTVReportData(
  filters: FilterState[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
  page: number,
  pageSize: number
): Promise<ReportResult> {
  let items = await getCustomerLTVReport();

  for (const filter of filters) {
    if (filter.fieldId === 'segment' && filter.value) {
      items = items.filter((i) => i.segment === filter.value);
    }
    if (filter.fieldId === 'acquisitionRep' && filter.value) {
      items = items.filter((i) => i.acquisitionRep === filter.value);
    }
  }

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
  }

  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

  const reps = Array.from(new Set(items.map((i) => i.acquisitionRep))).sort();
  const filterOptions = {
    segment: [
      { value: 'Platinum', label: 'Platinum' },
      { value: 'Gold', label: 'Gold' },
      { value: 'Silver', label: 'Silver' },
      { value: 'Bronze', label: 'Bronze' },
    ],
    acquisitionRep: reps.map((r) => ({ value: r, label: r })),
  };

  return { data: pageData, totalCount, filterOptions };
}

async function getFirstToSecondReportData(
  page: number,
  pageSize: number
): Promise<ReportResult> {
  const items = await getFirstToSecondReport();
  const totalCount = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);
  return { data: pageData, totalCount };
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: NextRequest) {
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
        result = await getExceptionReportData(filters, sortBy, sortDir, page, pageSize);
        break;
      case 'cohort-retention':
        result = await getCohortRetentionReportData(page, pageSize);
        break;
      case 'account-potential':
        result = await getAccountPotentialReportData(filters, sortBy, sortDir, page, pageSize);
        break;
      case 'rep-scorecard':
        result = await getRepScorecardReportData(filters, sortBy, sortDir, page, pageSize);
        break;
      case 'customer-ltv':
        result = await getCustomerLTVReportData(filters, sortBy, sortDir, page, pageSize);
        break;
      case 'first-to-second':
        result = await getFirstToSecondReportData(page, pageSize);
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
