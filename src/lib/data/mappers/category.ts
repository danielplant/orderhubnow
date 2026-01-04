import type { SkuCategories, SkuMainCategory } from '@prisma/client'
import type {
  Category,
  CategoryWithCount,
  MainCategory,
  SubCategory,
  CategoryWithProducts,
  CategoryProduct,
} from '@/lib/types'

export type { Category, CategoryWithCount }

export function mapCategory(prismaCategory: SkuCategories): Category {
  return {
    id: prismaCategory.ID,
    name: prismaCategory.Name,
    isPreOrder: prismaCategory.IsPreOrder ?? false,
    sortOrder: prismaCategory.SortOrder ?? 0,
  }
}

export function mapCategories(prismaCategories: SkuCategories[]): Category[] {
  return prismaCategories.map(mapCategory)
}

type CategoryWithSkuCount = SkuCategories & { _count: { Sku: number } }

export function mapCategoryWithCount(prismaCategory: CategoryWithSkuCount): CategoryWithCount {
  return {
    id: prismaCategory.ID,
    name: prismaCategory.Name,
    isPreOrder: prismaCategory.IsPreOrder ?? false,
    sortOrder: prismaCategory.SortOrder ?? 0,
    productCount: prismaCategory._count.Sku,
  }
}

export function mapCategoriesWithCount(prismaCategories: CategoryWithSkuCount[]): CategoryWithCount[] {
  return prismaCategories.map(mapCategoryWithCount)
}

type MainWithRships = SkuMainCategory & {
  SkuMainSubRship: Array<{
    SkuSubCatID: number
    SkuCategories: SkuCategories & { _count: { Sku: number } }
  }>
}

export function mapCategoryTree(rows: MainWithRships[]): MainCategory[] {
  return rows.map((main) => {
    const subCategories: SubCategory[] = main.SkuMainSubRship.map((rship) => ({
      id: rship.SkuCategories.ID,
      mainCategoryId: main.ID,
      name: rship.SkuCategories.Name,
      sortOrder: rship.SkuCategories.SortOrder ?? 0,
      isPreOrder: rship.SkuCategories.IsPreOrder ?? false,
      useShopifyImages: rship.SkuCategories.ShopifyImages ?? false,
      shopifyOrderTags: rship.SkuCategories.ShopifyOrderTags ?? null,
      onRouteStartDate: rship.SkuCategories.OnRouteAvailableDate
        ? rship.SkuCategories.OnRouteAvailableDate.toISOString()
        : null,
      onRouteEndDate: rship.SkuCategories.OnRouteAvailableDateEnd
        ? rship.SkuCategories.OnRouteAvailableDateEnd.toISOString()
        : null,
      imageUrl: `/SkuImages/${rship.SkuCategories.ID}.jpg`,
      productCount: rship.SkuCategories._count.Sku,
    }))

    // Sort subcategories by sortOrder
    subCategories.sort((a, b) => a.sortOrder - b.sortOrder)

    return {
      id: main.ID,
      name: main.Name,
      sortOrder: main.DisplayOrder ?? 0,
      subCategories,
    }
  })
}

export function mapCategoryWithProducts(params: {
  mainCategoryId: number
  category: SkuCategories & { _count: { Sku: number } }
  products: CategoryProduct[]
}): CategoryWithProducts {
  const { mainCategoryId, category, products } = params

  return {
    id: category.ID,
    mainCategoryId,
    name: category.Name,
    sortOrder: category.SortOrder ?? 0,
    isPreOrder: category.IsPreOrder ?? false,
    useShopifyImages: category.ShopifyImages ?? false,
    shopifyOrderTags: category.ShopifyOrderTags ?? null,
    onRouteStartDate: category.OnRouteAvailableDate ? category.OnRouteAvailableDate.toISOString() : null,
    onRouteEndDate: category.OnRouteAvailableDateEnd ? category.OnRouteAvailableDateEnd.toISOString() : null,
    imageUrl: `/SkuImages/${category.ID}.jpg`,
    productCount: category._count.Sku,
    products,
  }
}
