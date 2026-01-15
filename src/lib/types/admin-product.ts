/**
 * Admin Products (SKU) page types.
 * Distinct from buyer-facing Product type in inventory.ts.
 */

export type InventoryTab = 'all' | 'ats' | 'preorder'

export type CollectionFilterMode = 'all' | 'ats' | 'preorder' | 'specific'

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
  // New collections-based filtering
  collectionsMode: CollectionFilterMode
  collectionIds?: number[]  // Only used when collectionsMode === 'specific'
  q?: string
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
  material: string // FabricContent
  categoryId: number | null
  categoryName: string | null
  showInPreOrder: boolean | null
  quantity: number // Available
  onRoute: number
  // Wholesale price (CAD/USD)
  priceCadRaw: string | null
  priceUsdRaw: string | null
  priceCad: number
  priceUsd: number
  // Retail price (MSRP CAD/USD)
  msrpCadRaw: string | null
  msrpUsdRaw: string | null
  msrpCad: number
  msrpUsd: number
  // Unit pricing (for prepacks)
  unitsPerSku: number // 1 for singles, 2 for 2PC, 3 for 3PC, etc.
  unitPriceCad: number | null
  unitPriceUsd: number | null
  imageUrl: string | null
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
  type: 'ATS' | 'PreOrder'
}
