// Category domain types

export interface Category {
  id: number
  name: string
  isPreOrder: boolean
  sortOrder: number
}

export interface CategoryWithCount extends Category {
  productCount: number
}

export interface SubCategory {
  id: number
  // This is the "current parent" in the rendered tree row.
  // The underlying DB relationship is many-to-many via SkuMainSubRship.
  mainCategoryId: number

  name: string
  sortOrder: number

  isPreOrder: boolean
  useShopifyImages: boolean

  shopifyOrderTags?: string | null
  onRouteStartDate?: string | null
  onRouteEndDate?: string | null

  imageUrl?: string | null
  productCount: number
}

export interface MainCategory {
  id: number
  name: string
  sortOrder: number
  subCategories: SubCategory[]
}

export interface CategoryProduct {
  id: string // baseSku (matches .NET "contains" update logic)
  skuId: string // baseSku (explicit for clarity)
  description: string
  imageUrl?: string | null
  sortOrder: number // DisplayPriority
}

export interface CategoryWithProducts extends SubCategory {
  products: CategoryProduct[]
}
