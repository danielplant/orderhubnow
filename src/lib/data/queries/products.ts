/**
 * Products (SKU) queries - data layer for admin products page
 * Uses parseSkuId() to derive BaseSku and ParsedSize from SkuID
 */

import { prisma } from '@/lib/prisma'
import { parsePrice, parseSkuId } from '@/lib/utils'
import type {
  ProductsListInput,
  ProductsListResult,
  ProductsSortColumn,
  SortDirection,
  CategoryForFilter,
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
 */
export function parseProductsListInput(
  searchParams: Record<string, string | string[] | undefined>
): ProductsListInput {
  const getParam = (key: string): string | undefined => {
    const val = searchParams[key]
    return Array.isArray(val) ? val[0] : val
  }

  const tabRaw = getString(getParam('tab')) ?? 'all'
  const tab = tabRaw === 'ats' || tabRaw === 'preorder' ? tabRaw : 'all'

  const q = getString(getParam('q'))
  const collectionIdStr = getString(getParam('collectionId'))
  const collectionId = collectionIdStr ? parseInt(collectionIdStr, 10) : undefined

  const sort = (getString(getParam('sort')) as ProductsSortColumn | undefined) ?? 'dateModified'
  const dir = (getString(getParam('dir')) as SortDirection | undefined) ?? 'desc'
  const page = toInt(getParam('page'), 1)
  const pageSize = toInt(getParam('pageSize'), 50)

  return {
    tab,
    q,
    collectionId: Number.isFinite(collectionId) ? collectionId : undefined,
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
  const baseWhere: any = {}

  // Search across multiple fields (BaseSku removed - it's derived from SkuID)
  if (input.q) {
    baseWhere.OR = [
      { SkuID: { contains: input.q, mode: 'insensitive' } },
      { Description: { contains: input.q, mode: 'insensitive' } },
      { OrderEntryDescription: { contains: input.q, mode: 'insensitive' } },
    ]
  }

  // Collection filter
  if (typeof input.collectionId === 'number') {
    baseWhere.CollectionID = input.collectionId
  }

  // Tab-specific where clauses
  // ATS = ShowInPreOrder is false OR null
  // PreOrder = ShowInPreOrder is true
  const atsCondition = { OR: [{ ShowInPreOrder: false }, { ShowInPreOrder: null }] }
  const preorderCondition = { ShowInPreOrder: true }

  // Build final where based on tab
  let tabWhere: typeof baseWhere
  if (input.tab === 'ats') {
    tabWhere = { ...baseWhere, ...atsCondition }
  } else if (input.tab === 'preorder') {
    tabWhere = { ...baseWhere, ...preorderCondition }
  } else {
    tabWhere = baseWhere
  }

  // For tab counts, we need separate queries with baseWhere (not tab-filtered)
  const atsCountWhere = { ...baseWhere, ...atsCondition }
  const preorderCountWhere = { ...baseWhere, ...preorderCondition }

  const [total, rows, atsCount, preorderCount] = await Promise.all([
    prisma.sku.count({ where: tabWhere }),
    prisma.sku.findMany({
      where: tabWhere,
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
        ShopifyImageURL: true,
        CollectionID: true,
        Collection: {
          select: { name: true },
        },
      },
    }),
    prisma.sku.count({ where: atsCountWhere }),
    prisma.sku.count({ where: preorderCountWhere }),
  ])

  return {
    total,
    tabCounts: {
      all: atsCount + preorderCount,
      ats: atsCount,
      preorder: preorderCount,
    },
    rows: rows.map((r) => {
      const skuId = r.SkuID
      const qty = r.Quantity ?? 0
      const { baseSku, parsedSize } = parseSkuId(skuId)
      return {
        id: String(r.ID),
        skuId,
        baseSku,
        parsedSize,
        description: (r.OrderEntryDescription ?? r.Description ?? skuId) as string,
        color: r.SkuColor ?? '',
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
    name: `${c.name} (${c.type})`,
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

  return {
    id: String(row.ID),
    skuId: row.SkuID,
    description: row.OrderEntryDescription ?? row.Description ?? '',
    color: row.SkuColor ?? '',
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
    },
  })

  if (skus.length === 0) return null

  const first = skus[0]
  
  // Build variants array with size info
  const variants = skus.map((sku) => {
    const { parsedSize } = parseSkuId(sku.SkuID)
    return {
      sku: sku.SkuID,
      size: parsedSize,
      available: sku.Quantity ?? 0,
      onRoute: sku.OnRoute ?? 0,
      priceCad: parsePrice(sku.PriceCAD),
      priceUsd: parsePrice(sku.PriceUSD),
    }
  })

  return {
    baseSku,
    title: first.OrderEntryDescription ?? first.Description ?? baseSku,
    color: first.SkuColor ?? '',
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
