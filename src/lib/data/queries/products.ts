/**
 * Products (SKU) queries - data layer for admin products page
 * Uses sku.Size field (from Shopify selectedOptions) as canonical size source
 */

import { prisma } from '@/lib/prisma'
import { parsePrice, getBaseSku, resolveColor } from '@/lib/utils'
import {
  getIncomingMapForSkus,
} from '@/lib/data/queries/availability-settings'
import {
  computeAvailabilityDisplayFromRules,
  loadDisplayRulesData,
  getScenarioFromCollectionType,
  type DisplayRulesData,
} from '@/lib/availability/compute'
import type {
  ProductsListInput,
  ProductsListResult,
  ProductsSortColumn,
  SortDirection,
  CategoryForFilter,
  CollectionFilterMode,
} from '@/lib/types'

// ============================================================================
// Helpers
// ============================================================================

function toInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t || undefined
}

/**
 * Parse Next.js searchParams into typed ProductsListInput.
 * Supports new 'collections' param format:
 * - collections=all → show all products
 * - collections=ats → show products from ATS-type collections
 * - collections=preorder → show products from PreOrder-type collections
 * - collections=1,2,3 → show products from specific collection IDs
 */
export function parseProductsListInput(
  searchParams: Record<string, string | string[] | undefined>
): ProductsListInput {
  const getParam = (key: string): string | undefined => {
    const val = searchParams[key]
    return Array.isArray(val) ? val[0] : val
  }

  const q = getString(getParam('q'))
  const sort = (getString(getParam('sort')) as ProductsSortColumn | undefined) ?? 'dateModified'
  const dir = (getString(getParam('dir')) as SortDirection | undefined) ?? 'desc'
  const page = toInt(getParam('page'), 1)
  const pageSize = toInt(getParam('pageSize'), 50)

  // Parse collections param
  const collectionsRaw = getString(getParam('collections')) ?? 'all'
  let collectionsMode: CollectionFilterMode = 'all'
  let collectionIds: number[] | undefined

  if (collectionsRaw === 'all' || collectionsRaw === 'ats' || collectionsRaw === 'preorder') {
    collectionsMode = collectionsRaw
  } else if (collectionsRaw === 'specific') {
    // 'specific' mode with no IDs selected yet
    collectionsMode = 'specific'
    collectionIds = []
  } else {
    // Try to parse as comma-separated IDs
    const ids = collectionsRaw.split(',').map(Number).filter(Number.isFinite)
    if (ids.length > 0) {
      collectionsMode = 'specific'
      collectionIds = ids
    }
  }

  return {
    collectionsMode,
    collectionIds,
    q,
    sort,
    dir,
    page,
    pageSize,
  }
}

function buildOrderBy(sort: ProductsSortColumn, dir: SortDirection) {
  const direction = dir === 'asc' ? 'asc' : 'desc'

  switch (sort) {
    case 'skuId':
      return { SkuID: direction } as const
    case 'baseSku':
      // BaseSku is derived from SkuID, so sort by SkuID
      return { SkuID: direction } as const
    case 'size':
      // ParsedSize is derived from SkuID, so sort by SkuID
      return { SkuID: direction } as const
    case 'description':
      return { OrderEntryDescription: direction } as const
    case 'quantity':
      return { Quantity: direction } as const
    case 'onRoute':
      return { OnRoute: direction } as const
    case 'category':
      return { CategoryID: direction } as const
    case 'dateModified':
    default:
      return { DateModified: direction } as const
  }
}

// ============================================================================
// Main Query
// ============================================================================

/**
 * Get paginated, filtered, sorted products (SKUs) for admin list view.
 */
export async function getProducts(
  searchParams: Record<string, string | string[] | undefined>,
  options?: { view?: string; displayRulesData?: DisplayRulesData }
): Promise<ProductsListResult> {
  const input = parseProductsListInput(searchParams)
  const view = options?.view ?? 'admin_products'
  const displayRulesData = options?.displayRulesData ?? await loadDisplayRulesData()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  // Search across multiple fields
  // Note: SQL Server collation is case-insensitive by default, so no 'mode' needed
  if (input.q) {
    where.OR = [
      { SkuID: { contains: input.q } },
      { Description: { contains: input.q } },
      { OrderEntryDescription: { contains: input.q } },
    ]
  }

  // Collection filter based on mode
  switch (input.collectionsMode) {
    case 'ats':
      // Filter to products from ATS-type collections
      where.Collection = { type: 'ats' }
      break
    case 'preorder':
      // Filter to products from PreOrder-type collections
      where.Collection = { type: { in: ['preorder_no_po', 'preorder_po'] } }
      break
    case 'specific':
      // Filter to specific collection IDs (if any selected)
      if (input.collectionIds && input.collectionIds.length > 0) {
        where.CollectionID = { in: input.collectionIds }
      }
      break
    case 'all':
    default:
      // No collection filter
      break
  }

  const manualAvailableSort = input.sort === 'quantity'

  const [total, rows] = await Promise.all([
    prisma.sku.count({ where }),
    prisma.sku.findMany({
      where,
      orderBy: manualAvailableSort ? { SkuID: 'asc' } : buildOrderBy(input.sort, input.dir),
      skip: manualAvailableSort ? undefined : (input.page - 1) * input.pageSize,
      take: manualAvailableSort ? undefined : input.pageSize,
      select: {
        ID: true,
        SkuID: true,
        Description: true,
        OrderEntryDescription: true,
        SkuColor: true,
        FabricContent: true,
        CategoryID: true,
        ShowInPreOrder: true,
        Quantity: true,
        OnRoute: true,
        PriceCAD: true,
        PriceUSD: true,
        MSRPCAD: true,
        MSRPUSD: true,
        UnitsPerSku: true,
        UnitPriceCAD: true,
        UnitPriceUSD: true,
        ShopifyImageURL: true,
        ThumbnailPath: true,
        CollectionID: true,
        Size: true,
        Collection: {
          select: { name: true, type: true },
        },
      },
    }),
  ])

  const incomingMap = await getIncomingMapForSkus(rows.map((row) => row.SkuID))

  const mappedRows = await Promise.all(rows.map(async (r) => {
    const skuId = r.SkuID
    const qty = r.Quantity ?? 0
    const baseSku = getBaseSku(skuId, r.Size)
    const size = r.Size || ''
    const description = (r.OrderEntryDescription ?? r.Description ?? skuId) as string
    const incomingEntry = incomingMap.get(skuId)
    const incoming = incomingEntry?.incoming ?? null
    const committed = incomingEntry?.committed ?? null
    const onHand = incomingEntry?.onHand ?? null
    const displayResult = await computeAvailabilityDisplayFromRules(
      r.Collection?.type ?? null,
      view,
      { quantity: qty, incoming, committed, onHand },
      displayRulesData
    )

    return {
      id: String(r.ID),
      skuId,
      baseSku,
      parsedSize: size,
      description,
      rawDescription: r.Description ?? '', // Raw Shopify description for search transparency
      color: resolveColor(r.SkuColor, skuId, description),
      material: r.FabricContent ?? '',
      categoryId: r.CollectionID ?? null,
      categoryName: r.Collection?.name ?? null,
      collectionType: (r.Collection?.type as 'ats' | 'preorder_po' | 'preorder_no_po' | undefined) ?? null,
      showInPreOrder: r.ShowInPreOrder ?? null,
      quantity: qty,
      onRoute: r.OnRoute ?? 0,
      availableDisplay: displayResult.display,
      availableSortValue: displayResult.numericValue,
      availableSortRank: displayResult.isBlank ? 1 : 0,
      availabilityScenario: getScenarioFromCollectionType(r.Collection?.type ?? null) as 'ats' | 'preorder_po' | 'preorder_no_po',
      priceCadRaw: r.PriceCAD,
      priceUsdRaw: r.PriceUSD,
      priceCad: parsePrice(r.PriceCAD),
      priceUsd: parsePrice(r.PriceUSD),
      msrpCadRaw: r.MSRPCAD,
      msrpUsdRaw: r.MSRPUSD,
      msrpCad: parsePrice(r.MSRPCAD),
      msrpUsd: parsePrice(r.MSRPUSD),
      unitsPerSku: r.UnitsPerSku ?? 1,
      unitPriceCad: r.UnitPriceCAD ? Number(r.UnitPriceCAD) : null,
      unitPriceUsd: r.UnitPriceUSD ? Number(r.UnitPriceUSD) : null,
      imageUrl: r.ShopifyImageURL ?? null,
      thumbnailPath: r.ThumbnailPath ?? null,
    }
  }))

  const finalRows = manualAvailableSort
    ? mappedRows
        .sort((a, b) => {
          if (a.availableSortRank !== b.availableSortRank) {
            return a.availableSortRank - b.availableSortRank
          }
          const aVal = a.availableSortValue
          const bVal = b.availableSortValue
          if (aVal == null && bVal == null) {
            return a.skuId.localeCompare(b.skuId)
          }
          if (aVal == null) return 1
          if (bVal == null) return -1
          if (aVal !== bVal) {
            return input.dir === 'asc' ? aVal - bVal : bVal - aVal
          }
          return a.skuId.localeCompare(b.skuId)
        })
        .slice((input.page - 1) * input.pageSize, input.page * input.pageSize)
    : mappedRows

  // Determine column label from display rules (normalize legacy view keys)
  const VIEW_LABEL_MAP: Record<string, string> = { rep_products: 'rep_ats', buyer_products: 'buyer_ats' }
  const labelView = VIEW_LABEL_MAP[view] ?? view
  const availableLabel = displayRulesData.rules['ats']?.[labelView]?.label ?? 'Available'

  return {
    total,
    // Tab counts no longer needed - keep empty for backward compatibility
    tabCounts: { all: total, ats: 0, preorder: 0 },
    rows: finalRows,
    availableLabel,
  }
}

// ============================================================================
// Supporting Queries
// ============================================================================

/**
 * Get collections for filter dropdown.
 * Returns collections that have at least one SKU.
 */
export async function getCollectionsForFilter(): Promise<CategoryForFilter[]> {
  const collections = await prisma.collection.findMany({
    where: {
      skus: { some: {} }, // Only collections with SKUs
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as 'preorder_no_po' | 'preorder_po' | 'ats',
  }))
}

/**
 * Get a single SKU by ID for editing.
 */
export async function getSkuById(id: string) {
  const row = await prisma.sku.findUnique({
    where: { ID: BigInt(id) },
    select: {
      ID: true,
      SkuID: true,
      Description: true,
      OrderEntryDescription: true,
      SkuColor: true,
      CategoryID: true,
      ShowInPreOrder: true,
      Quantity: true,
      OnRoute: true,
      PriceCAD: true,
      PriceUSD: true,
      ShopifyImageURL: true,
      ThumbnailPath: true,
      DateAdded: true,
      DateModified: true,
    },
  })

  if (!row) return null

  const description = row.OrderEntryDescription ?? row.Description ?? ''
  return {
    id: String(row.ID),
    skuId: row.SkuID,
    description,
    color: resolveColor(row.SkuColor, row.SkuID, description),
    categoryId: row.CategoryID,
    showInPreOrder: row.ShowInPreOrder,
    quantity: row.Quantity ?? 0,
    onRoute: row.OnRoute ?? 0,
    priceCad: row.PriceCAD ?? '',
    priceUsd: row.PriceUSD ?? '',
    imageUrl: row.ShopifyImageURL,
    thumbnailPath: row.ThumbnailPath ?? null,
    dateAdded: row.DateAdded?.toISOString() ?? null,
    dateModified: row.DateModified?.toISOString() ?? null,
  }
}

/**
 * Get all SKU variants for a base SKU (for product detail modal)
 * Groups all size variants under a single product view
 */
export async function getProductByBaseSku(baseSku: string) {
  // Find all SKUs that start with baseSku followed by a dash
  const skus = await prisma.sku.findMany({
    where: {
      SkuID: { startsWith: `${baseSku}-` },
    },
    orderBy: { SkuID: 'asc' },
    select: {
      ID: true,
      SkuID: true,
      Description: true,
      OrderEntryDescription: true,
      SkuColor: true,
      FabricContent: true,
      CategoryID: true,
      ShowInPreOrder: true,
      Quantity: true,
      OnRoute: true,
      PriceCAD: true,
      PriceUSD: true,
      MSRPCAD: true,
      MSRPUSD: true,
      ShopifyImageURL: true,
      ThumbnailPath: true,
      Size: true,
      Collection: { select: { type: true } },
    },
  })

  if (skus.length === 0) return null

  const first = skus[0]

  // Load display rules and incoming data for all variants
  const displayRulesData = await loadDisplayRulesData()
  const incomingMap = await getIncomingMapForSkus(skus.map((s) => s.SkuID))

  // Build variants array using display rules (same pipeline as all other views)
  const variants = await Promise.all(skus.map(async (sku) => {
    const qty = sku.Quantity ?? 0
    const incomingEntry = incomingMap.get(sku.SkuID)
    const incoming = incomingEntry?.incoming ?? null
    const committed = incomingEntry?.committed ?? null
    const onHand = incomingEntry?.onHand ?? null
    const displayResult = await computeAvailabilityDisplayFromRules(
      sku.Collection?.type ?? null,
      'admin_modal',
      { quantity: qty, incoming, committed, onHand },
      displayRulesData
    )

    return {
      sku: sku.SkuID,
      size: sku.Size || '',
      available: displayResult.numericValue ?? 0,
      availableDisplay: displayResult.display,
      priceCad: parsePrice(sku.PriceCAD),
      priceUsd: parsePrice(sku.PriceUSD),
    }
  }))

  const title = first.OrderEntryDescription ?? first.Description ?? baseSku
  return {
    baseSku,
    title,
    color: resolveColor(first.SkuColor, first.SkuID, title),
    material: first.FabricContent ?? '',
    imageUrl: first.ShopifyImageURL ?? null,
    thumbnailPath: first.ThumbnailPath ?? null,
    isPreOrder: first.Collection?.type === 'preorder_po' || first.Collection?.type === 'preorder_no_po',
    priceCad: parsePrice(first.PriceCAD),
    priceUsd: parsePrice(first.PriceUSD),
    msrpCad: parsePrice(first.MSRPCAD),
    msrpUsd: parsePrice(first.MSRPUSD),
    variants,
  }
}
