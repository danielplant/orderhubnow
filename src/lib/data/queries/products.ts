/**
 * Products (SKU) queries - data layer for admin products page
 * Uses sku.Size field (from Shopify selectedOptions) as canonical size source
 */

import { prisma } from '@/lib/prisma'
import { parsePrice, parseSkuId, resolveColor } from '@/lib/utils'
import { extractSize } from '@/lib/utils/size-sort'
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
  searchParams: Record<string, string | string[] | undefined>
): Promise<ProductsListResult> {
  const input = parseProductsListInput(searchParams)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  // Search across multiple fields
  if (input.q) {
    where.OR = [
      { SkuID: { contains: input.q, mode: 'insensitive' } },
      { Description: { contains: input.q, mode: 'insensitive' } },
      { OrderEntryDescription: { contains: input.q, mode: 'insensitive' } },
    ]
  }

  // Collection filter based on mode
  switch (input.collectionsMode) {
    case 'ats':
      // Filter to products from ATS-type collections
      where.Collection = { type: 'ATS' }
      break
    case 'preorder':
      // Filter to products from PreOrder-type collections
      where.Collection = { type: 'PreOrder' }
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

  const [total, rows] = await Promise.all([
    prisma.sku.count({ where }),
    prisma.sku.findMany({
      where,
      orderBy: buildOrderBy(input.sort, input.dir),
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
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
        CollectionID: true,
        Size: true,
        Collection: {
          select: { name: true },
        },
      },
    }),
  ])

  return {
    total,
    // Tab counts no longer needed - keep empty for backward compatibility
    tabCounts: { all: total, ats: 0, preorder: 0 },
    rows: rows.map((r) => {
      const skuId = r.SkuID
      const qty = r.Quantity ?? 0
      const { baseSku } = parseSkuId(skuId)
      const size = extractSize(r.Size || '')
      const description = (r.OrderEntryDescription ?? r.Description ?? skuId) as string
      return {
        id: String(r.ID),
        skuId,
        baseSku,
        parsedSize: size,
        description,
        color: resolveColor(r.SkuColor, skuId, description),
        material: r.FabricContent ?? '',
        categoryId: r.CollectionID ?? null,
        categoryName: r.Collection?.name ?? null,
        showInPreOrder: r.ShowInPreOrder ?? null,
        quantity: qty,
        onRoute: r.OnRoute ?? 0,
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
      }
    }),
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
    type: c.type as 'ATS' | 'PreOrder',
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
      Size: true,
    },
  })

  if (skus.length === 0) return null

  const first = skus[0]
  
  // Build variants array with size info
  const variants = skus.map((sku) => {
    return {
      sku: sku.SkuID,
      size: extractSize(sku.Size || ''),
      available: sku.Quantity ?? 0,
      onRoute: sku.OnRoute ?? 0,
      priceCad: parsePrice(sku.PriceCAD),
      priceUsd: parsePrice(sku.PriceUSD),
    }
  })

  const title = first.OrderEntryDescription ?? first.Description ?? baseSku
  return {
    baseSku,
    title,
    color: resolveColor(first.SkuColor, first.SkuID, title),
    material: first.FabricContent ?? '',
    imageUrl: first.ShopifyImageURL ?? null,
    isPreOrder: first.ShowInPreOrder ?? false,
    priceCad: parsePrice(first.PriceCAD),
    priceUsd: parsePrice(first.PriceUSD),
    msrpCad: parsePrice(first.MSRPCAD),
    msrpUsd: parsePrice(first.MSRPUSD),
    variants,
  }
}
