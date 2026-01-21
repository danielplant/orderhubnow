import { prisma } from '@/lib/prisma'
import type { DashboardMetrics, CategoryMetric } from '@/lib/types'
import { getEffectiveQuantity } from '@/lib/utils'

// ============================================================================
// Types for Inventory List
// ============================================================================

export type InventoryStatusFilter = 'all' | 'low' | 'out' | 'onroute'
export type InventorySortField = 'sku' | 'qty' | 'onRoute'
export type SortDirection = 'asc' | 'desc'

// Map UI column IDs to database field names
const INVENTORY_SORT_FIELDS: Record<InventorySortField, string> = {
  sku: 'SkuID',
  qty: 'Quantity',
  onRoute: 'OnRoute',
}

export interface InventoryListFilters {
  status?: InventoryStatusFilter
  search?: string
  sortBy?: InventorySortField
  sortDir?: SortDirection
  // Dropdown filter values
  collectionId?: string
  color?: string
  fabric?: string
  size?: string
}

export interface InventoryListItem {
  id: string // Unique database ID (for React keys)
  skuId: string
  description: string | null
  quantity: number
  onRoute: number
  effectiveQuantity: number
  prepackMultiplier: number // 1 for singles, 2+ for prepacks
  unitPriceCad: number | null
  unitPriceUsd: number | null
  lastUpdated: string | null // ISO string for serialization
  isLowStock: boolean
  isOutOfStock: boolean
  // Additional fields for filtering and display
  collection: string | null
  color: string | null
  fabric: string | null
  size: string | null
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
 * Get inventory metrics for ATS and PreOrder collections
 */
export async function getInventoryMetrics(): Promise<DashboardMetrics> {
  // Get ATS collections with SKU counts (only active, visible collections)
  const atsCollections = await prisma.collection.findMany({
    where: {
      type: 'ATS',
      isActive: true,
    },
    include: {
      _count: {
        select: { skus: true }
      }
    },
    orderBy: { sortOrder: 'asc' }
  })

  // Get PreOrder collections with SKU counts (only active, visible collections)
  const preOrderCollections = await prisma.collection.findMany({
    where: {
      type: 'PreOrder',
      isActive: true,
    },
    include: {
      _count: {
        select: { skus: true }
      }
    },
    orderBy: { sortOrder: 'asc' }
  })

  // Transform to CategoryMetric format
  const mapToMetric = (col: { name: string; _count: { skus: number } }): CategoryMetric => ({
    name: col.name,
    count: col._count.skus
  })

  const atsMetrics = atsCollections.map(mapToMetric).filter(c => c.count > 0)
  const preOrderMetrics = preOrderCollections.map(mapToMetric).filter(c => c.count > 0)

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

  // Build base where clause for search and dropdown filters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseWhere: any = {}

  // Search filter
  if (q) {
    baseWhere.AND = [
      ...(baseWhere.AND ?? []),
      {
        OR: [
          { SkuID: { contains: q } },
          { Description: { contains: q } },
        ],
      },
    ]
  }

  // Dropdown filters
  if (filters.collectionId) {
    baseWhere.CollectionID = Number(filters.collectionId)
  }
  if (filters.color) {
    baseWhere.SkuColor = filters.color
  }
  if (filters.fabric) {
    baseWhere.FabricContent = filters.fabric
  }
  if (filters.size) {
    baseWhere.Size = filters.size
  }

  // Add status filter
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

  // Build dynamic orderBy based on sort params
  const sortField = INVENTORY_SORT_FIELDS[filters.sortBy ?? 'sku']
  const sortDir = filters.sortDir ?? 'asc'

  const [rows, total] = await Promise.all([
    prisma.sku.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      select: {
        ID: true,
        SkuID: true,
        Description: true,
        Quantity: true,
        OnRoute: true,
        DateModified: true,
        UnitsPerSku: true,
        UnitPriceCAD: true,
        UnitPriceUSD: true,
        Size: true,
        SkuColor: true,
        FabricContent: true,
        Collection: {
          select: { name: true },
        },
      },
    }),
    prisma.sku.count({ where }),
  ])

  const items: InventoryListItem[] = rows.map((r) => {
    const qty = r.Quantity ?? 0
    const onRoute = r.OnRoute ?? 0
    // Effective quantity is the prepack-adjusted quantity (not including onRoute)
    const effective = getEffectiveQuantity(r.SkuID, qty)

    // Use database field if available, otherwise fall back to SKU parsing
    const prepackMultiplier = r.UnitsPerSku ?? 1

    return {
      id: String(r.ID), // Unique database ID for React keys
      skuId: r.SkuID,
      description: r.Description ?? null,
      quantity: qty,
      onRoute,
      effectiveQuantity: effective,
      prepackMultiplier,
      unitPriceCad: r.UnitPriceCAD ? Number(r.UnitPriceCAD) : null,
      unitPriceUsd: r.UnitPriceUSD ? Number(r.UnitPriceUSD) : null,
      lastUpdated: r.DateModified?.toISOString() ?? null,
      isLowStock: qty > 0 && qty <= lowThreshold,
      isOutOfStock: qty === 0,
      // Additional fields for filtering and display
      collection: r.Collection?.name ?? null,
      color: r.SkuColor ?? null,
      fabric: r.FabricContent ?? null,
      size: r.Size ?? null,
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

// ============================================================================
// Inventory Facets (for filter dropdowns)
// ============================================================================

export interface InventoryFacets {
  collections: Array<{ value: string; label: string; count: number }>
  colors: Array<{ value: string; label: string; count: number }>
  fabrics: Array<{ value: string; label: string; count: number }>
  sizes: Array<{ value: string; label: string; count: number }>
}

/**
 * Get distinct filter options for inventory with counts.
 * Used to populate filter dropdown options.
 */
export async function getInventoryFacets(): Promise<InventoryFacets> {
  // Get collections with SKU counts
  const collections = await prisma.collection.findMany({
    where: {
      skus: { some: {} }, // Only collections with at least one SKU
    },
    select: {
      id: true,
      name: true,
      _count: { select: { skus: true } },
    },
    orderBy: { name: 'asc' },
  })

  // Get distinct colors, fabrics, sizes with counts
  const [colors, fabrics, sizes] = await Promise.all([
    prisma.sku.groupBy({
      by: ['SkuColor'],
      _count: { _all: true },
      where: {
        AND: [
          { SkuColor: { not: null } },
          { SkuColor: { not: '' } },
        ],
      },
      orderBy: { SkuColor: 'asc' },
    }),
    prisma.sku.groupBy({
      by: ['FabricContent'],
      _count: { _all: true },
      where: {
        AND: [
          { FabricContent: { not: null } },
          { FabricContent: { not: '' } },
        ],
      },
      orderBy: { FabricContent: 'asc' },
    }),
    prisma.sku.groupBy({
      by: ['Size'],
      _count: { _all: true },
      where: {
        AND: [
          { Size: { not: null } },
          { Size: { not: '' } },
        ],
      },
      orderBy: { Size: 'asc' },
    }),
  ])

  return {
    collections: collections.map((c) => ({
      value: String(c.id),
      label: c.name,
      count: c._count.skus,
    })),
    colors: colors
      .filter((c) => c.SkuColor)
      .map((c) => ({
        value: c.SkuColor!,
        label: c.SkuColor!,
        count: c._count._all,
      })),
    fabrics: fabrics
      .filter((f) => f.FabricContent)
      .map((f) => ({
        value: f.FabricContent!,
        label: f.FabricContent!.length > 30 ? f.FabricContent!.slice(0, 30) + '...' : f.FabricContent!,
        count: f._count._all,
      })),
    sizes: sizes
      .filter((s) => s.Size)
      .map((s) => ({
        value: s.Size!,
        label: s.Size!,
        count: s._count._all,
      })),
  }
}
