/**
 * Products (SKU) queries - data layer for admin products page
 * Uses parseSkuId() to derive BaseSku and ParsedSize from SkuID
 */

import { prisma } from '@/lib/prisma'
import { getEffectiveQuantity, parsePrice, parseSkuId } from '@/lib/utils'
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
  const categoryIdStr = getString(getParam('categoryId'))
  const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : undefined

  const sort = (getString(getParam('sort')) as ProductsSortColumn | undefined) ?? 'dateModified'
  const dir = (getString(getParam('dir')) as SortDirection | undefined) ?? 'desc'
  const page = toInt(getParam('page'), 1)
  const pageSize = toInt(getParam('pageSize'), 50)

  return {
    tab,
    q,
    categoryId: Number.isFinite(categoryId) ? categoryId : undefined,
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

  // Category filter
  if (typeof input.categoryId === 'number') {
    baseWhere.CategoryID = input.categoryId
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
        categoryId: r.CategoryID ?? null,
        categoryName: null, // Could join if needed; for now filter dropdown handles names
        showInPreOrder: r.ShowInPreOrder ?? null,
        quantity: qty,
        onRoute: r.OnRoute ?? 0,
        effectiveQuantity: getEffectiveQuantity(skuId, qty),
        priceCadRaw: r.PriceCAD,
        priceUsdRaw: r.PriceUSD,
        priceCad: parsePrice(r.PriceCAD),
        priceUsd: parsePrice(r.PriceUSD),
        imageUrl: r.ShopifyImageURL ?? null,
        dateAdded: r.DateAdded ? r.DateAdded.toISOString().slice(0, 10) : null,
        dateModified: r.DateModified ? r.DateModified.toISOString().slice(0, 10) : null,
      }
    }),
  }
}

// ============================================================================
// Supporting Queries
// ============================================================================

/**
 * Get categories for filter dropdown.
 * Returns categories that have at least one SKU.
 */
export async function getCategoriesForFilter(): Promise<CategoryForFilter[]> {
  const categories = await prisma.skuCategories.findMany({
    where: {
      Sku: { some: {} }, // Only categories with SKUs
    },
    select: {
      ID: true,
      Name: true,
    },
    orderBy: { Name: 'asc' },
  })

  return categories.map((c) => ({
    id: c.ID,
    name: c.Name,
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
