import { prisma } from '@/lib/prisma'
import { parseSkuId } from '@/lib/utils'
import {
  mapCategories,
  mapCategoriesWithCount,
  mapCategoryTree,
  mapCategoryWithProducts,
} from '../mappers/category'
import type {
  Category,
  CategoryWithCount,
  MainCategory,
  SubCategory,
  CategoryWithProducts,
  CategoryProduct,
} from '@/lib/types'

export async function getCategories(): Promise<Category[]> {
  const categories = await prisma.skuCategories.findMany({
    orderBy: { SortOrder: 'asc' },
  })
  return mapCategories(categories)
}

export async function getCategoriesWithProductCount(): Promise<CategoryWithCount[]> {
  const categories = await prisma.skuCategories.findMany({
    where: {
      // Exclude "Defective" categories from buyer views per .NET PreOrder.aspx.cs
      Name: { not: 'Defective' },
    },
    orderBy: { SortOrder: 'asc' },
    include: {
      _count: {
        select: { Sku: true },
      },
    },
  })
  return mapCategoriesWithCount(categories)
}

export async function getCategoryById(id: number): Promise<Category | null> {
  const category = await prisma.skuCategories.findUnique({
    where: { ID: id },
  })
  if (!category) return null
  return mapCategories([category])[0]
}

/**
 * Hierarchical main->sub tree (many-to-many via SkuMainSubRship)
 */
export async function getCategoryTree(): Promise<MainCategory[]> {
  const mains = await prisma.skuMainCategory.findMany({
    orderBy: [{ DisplayOrder: 'asc' }, { Name: 'asc' }],
    include: {
      SkuMainSubRship: {
        include: {
          SkuCategories: {
            include: {
              _count: { select: { Sku: true } },
            },
          },
        },
      },
    },
  })

  return mapCategoryTree(mains)
}

/**
 * Fetch a single subcategory by string id (URL-safe)
 */
export async function getSubCategoryById(id: string): Promise<SubCategory | null> {
  const categoryId = parseInt(id)
  if (Number.isNaN(categoryId)) return null

  const category = await prisma.skuCategories.findUnique({
    where: { ID: categoryId },
    include: {
      _count: { select: { Sku: true } },
      SkuMainSubRship: { select: { SkuMainCatID: true } },
    },
  })
  if (!category) return null

  // If a category belongs to multiple mains, we need a "current" mainCategoryId.
  // For this helper, pick the first relationship (UI-level calls should usually know the parent).
  const mainCategoryId = category.SkuMainSubRship[0]?.SkuMainCatID ?? 0

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
  }
}

/**
 * Category details + grouped products for ordering modal.
 * Mirrors .NET: product ordering updates DisplayPriority for all Sku rows whose SkuID contains baseSku.
 */
export async function getCategoryWithProducts(id: string): Promise<CategoryWithProducts | null> {
  const categoryId = parseInt(id)
  if (Number.isNaN(categoryId)) return null

  const [category, invSettings] = await Promise.all([
    prisma.skuCategories.findUnique({
      where: { ID: categoryId },
      include: {
        _count: { select: { Sku: true } },
        SkuMainSubRship: { select: { SkuMainCatID: true } },
      },
    }),
    prisma.inventorySettings.findFirst({
      select: { MinQuantityToShow: true },
      orderBy: { ID: 'asc' },
    }),
  ])

  if (!category) return null

  const mainCategoryId = category.SkuMainSubRship[0]?.SkuMainCatID ?? 0
  const minQty = invSettings?.MinQuantityToShow ?? 0

  // Query SKU table and derive BaseSku via parseSkuId()
  const skus = await prisma.sku.findMany({
    where: {
      CategoryID: categoryId,
      OR: [
        { Quantity: { gte: minQty } },
        { ShowInPreOrder: true },
      ],
    },
    orderBy: [{ DisplayPriority: 'asc' }, { SkuID: 'asc' }],
    select: {
      SkuID: true,
      DisplayPriority: true,
      OrderEntryDescription: true,
      Description: true,
      ShopifyImageURL: true,
      ThumbnailPath: true,
    },
  })

  // Group into "products" by BaseSku.
  const byBase = new Map<string, { sortOrder: number; description: string; imageUrl: string | null; thumbnailPath: string | null }>()
  for (const row of skus) {
    const { baseSku } = parseSkuId(row.SkuID)
    if (!baseSku) continue

    const sortOrder = row.DisplayPriority ?? 0
    const description = (row.OrderEntryDescription ?? row.Description ?? baseSku) as string
    const imageUrl = row.ShopifyImageURL ?? null
    const thumbnailPath = row.ThumbnailPath ?? null

    const existing = byBase.get(baseSku)
    if (!existing) {
      byBase.set(baseSku, { sortOrder, description, imageUrl, thumbnailPath })
    } else {
      // Keep the lowest DisplayPriority encountered for stability
      if (sortOrder < existing.sortOrder) {
        byBase.set(baseSku, { sortOrder, description: existing.description, imageUrl: existing.imageUrl, thumbnailPath: existing.thumbnailPath })
      }
    }
  }

  const products: CategoryProduct[] = Array.from(byBase.entries())
    .map(([baseSku, v]) => ({
      id: baseSku,
      skuId: baseSku,
      description: v.description,
      imageUrl: v.imageUrl,
      thumbnailPath: v.thumbnailPath,
      sortOrder: v.sortOrder,
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.skuId.localeCompare(b.skuId))

  return mapCategoryWithProducts({
    mainCategoryId,
    category,
    products,
  })
}
