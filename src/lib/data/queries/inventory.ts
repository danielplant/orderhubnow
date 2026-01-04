import { prisma } from '@/lib/prisma'
import type { DashboardMetrics, CategoryMetric } from '@/lib/types'
import { getEffectiveQuantity } from '@/lib/utils'

// ============================================================================
// Types for Inventory List
// ============================================================================

export type InventoryStatusFilter = 'all' | 'low' | 'out' | 'onroute'

export interface InventoryListFilters {
  status?: InventoryStatusFilter
  search?: string
}

export interface InventoryListItem {
  skuId: string
  description: string | null
  quantity: number
  onRoute: number
  effectiveQuantity: number
  prepackMultiplier: 1 | 2 | 3 | 6
  lastUpdated: string | null // ISO string for serialization
  isLowStock: boolean
  isOutOfStock: boolean
}

export interface InventoryListResult {
  items: InventoryListItem[]
  total: number
  statusCounts: { all: number; low: number; out: number; onroute: number }
  lowThreshold: number
}

// ============================================================================
// Dashboard Metrics (existing)
// ============================================================================

/**
 * Get inventory metrics for ATS and PreOrder categories
 */
export async function getInventoryMetrics(): Promise<DashboardMetrics> {
  // Get ATS categories with SKU counts
  const atsCategories = await prisma.skuCategories.findMany({
    where: { 
      IsPreOrder: false 
    },
    include: {
      _count: {
        select: { Sku: true }
      }
    },
    orderBy: { SortOrder: 'asc' }
  })

  // Get PreOrder categories with SKU counts
  const preOrderCategories = await prisma.skuCategories.findMany({
    where: { 
      IsPreOrder: true 
    },
    include: {
      _count: {
        select: { Sku: true }
      }
    },
    orderBy: { SortOrder: 'asc' }
  })

  // Transform to CategoryMetric format
  const mapToMetric = (cat: { Name: string; _count: { Sku: number } }): CategoryMetric => ({
    name: cat.Name,
    count: cat._count.Sku
  })

  const atsMetrics = atsCategories.map(mapToMetric).filter(c => c.count > 0)
  const preOrderMetrics = preOrderCategories.map(mapToMetric).filter(c => c.count > 0)

  return {
    ats: {
      total: atsMetrics.reduce((sum, c) => sum + c.count, 0),
      categories: atsMetrics,
      totalCategories: atsMetrics.length
    },
    preOrder: {
      total: preOrderMetrics.reduce((sum, c) => sum + c.count, 0),
      categories: preOrderMetrics,
      totalCategories: preOrderMetrics.length
    },
    lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}

// ============================================================================
// Inventory List (paginated)
// ============================================================================

/**
 * Get low stock threshold from InventorySettings table.
 * Falls back to 10 if no settings found.
 */
async function getLowStockThreshold(): Promise<number> {
  const settings = await prisma.inventorySettings.findFirst()
  return settings?.MinQuantityToShow ?? 10
}

/**
 * Paginated inventory list for /admin/inventory.
 * Uses Sku table (Quantity, OnRoute, DateModified).
 */
export async function getInventoryList(
  filters: InventoryListFilters,
  page: number,
  pageSize: number
): Promise<InventoryListResult> {
  const status = filters.status ?? 'all'
  const q = (filters.search ?? '').trim()
  const lowThreshold = await getLowStockThreshold()

  // Build where clause based on filters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseWhere: any = q
    ? {
        OR: [
          { SkuID: { contains: q } },
          { Description: { contains: q } },
        ],
      }
    : {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    ...baseWhere,
    ...(status === 'out'
      ? { OR: [{ Quantity: 0 }, { Quantity: null }] }
      : status === 'low'
        ? { Quantity: { gt: 0, lte: lowThreshold } }
        : status === 'onroute'
          ? { OnRoute: { gt: 0 } }
          : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.sku.findMany({
      where,
      orderBy: [{ DateModified: 'desc' }, { SkuID: 'asc' }],
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      select: {
        SkuID: true,
        Description: true,
        Quantity: true,
        OnRoute: true,
        DateModified: true,
      },
    }),
    prisma.sku.count({ where }),
  ])

  const items: InventoryListItem[] = rows.map((r) => {
    const qty = r.Quantity ?? 0
    const onRoute = r.OnRoute ?? 0
    // Effective quantity is the prepack-adjusted quantity (not including onRoute)
    const effective = getEffectiveQuantity(r.SkuID, qty)

    let prepackMultiplier: 1 | 2 | 3 | 6 = 1
    const lower = r.SkuID.toLowerCase()
    if (lower.includes('pp-')) {
      prepackMultiplier = lower.includes('2pc') ? 2 : lower.includes('3pc') ? 3 : 6
    }

    return {
      skuId: r.SkuID,
      description: r.Description ?? null,
      quantity: qty,
      onRoute,
      effectiveQuantity: effective,
      prepackMultiplier,
      lastUpdated: r.DateModified?.toISOString() ?? null,
      isLowStock: qty > 0 && qty <= lowThreshold,
      isOutOfStock: qty === 0,
    }
  })

  // Get status counts (with same search filter but different status filters)
  const [allCount, lowCount, outCount, onRouteCount] = await Promise.all([
    prisma.sku.count({ where: baseWhere }),
    prisma.sku.count({
      where: {
        ...baseWhere,
        Quantity: { gt: 0, lte: lowThreshold },
      },
    }),
    prisma.sku.count({
      where: {
        ...baseWhere,
        OR: [{ Quantity: 0 }, { Quantity: null }],
      },
    }),
    prisma.sku.count({
      where: {
        ...baseWhere,
        OnRoute: { gt: 0 },
      },
    }),
  ])

  return {
    items,
    total,
    statusCounts: { all: allCount, low: lowCount, out: outCount, onroute: onRouteCount },
    lowThreshold,
  }
}
