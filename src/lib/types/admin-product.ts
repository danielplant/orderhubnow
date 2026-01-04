/**
 * Admin Products (SKU) page types.
 * Distinct from buyer-facing Product type in inventory.ts.
 */

export type InventoryTab = 'all' | 'ats' | 'preorder'

export type ProductsSortColumn =
  | 'skuId'
  | 'baseSku'
  | 'size'
  | 'description'
  | 'category'
  | 'quantity'
  | 'onRoute'
  | 'dateModified'

export type SortDirection = 'asc' | 'desc'

export interface ProductsListInput {
  tab: InventoryTab
  q?: string
  categoryId?: number
  page: number
  pageSize: number
  sort: ProductsSortColumn
  dir: SortDirection
}

export interface AdminSkuRow {
  id: string // String(BigInt)
  skuId: string
  baseSku: string
  parsedSize: string
  description: string
  color: string
  categoryId: number | null
  categoryName: string | null
  showInPreOrder: boolean | null
  quantity: number
  onRoute: number
  effectiveQuantity: number
  priceCadRaw: string | null
  priceUsdRaw: string | null
  priceCad: number
  priceUsd: number
  imageUrl: string | null
  dateAdded: string | null
  dateModified: string | null
}

export interface ProductsListResult {
  total: number
  tabCounts: { all: number; ats: number; preorder: number }
  rows: AdminSkuRow[]
}

export interface CreateSkuInput {
  skuId: string
  description: string
  color: string
  size: string
  categoryId: number
  priceCad: string
  priceUsd: string
  quantity: number
  onRoute?: number
  showInPreOrder: boolean
}

export interface UpdateSkuInput {
  description?: string
  color?: string
  categoryId?: number
  priceCad?: string
  priceUsd?: string
  quantity?: number
  onRoute?: number
  showInPreOrder?: boolean
}

export interface CategoryForFilter {
  id: number
  name: string
}
