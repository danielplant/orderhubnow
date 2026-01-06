/**
 * Pre-Order Queries
 *
 * .NET Reference: PreOrder.aspx.cs
 *
 * Pre-order categories: IsPreOrder=true (from SQL)
 * Pre-order products: Fetched from Shopify API (clean SKUs, no DU3/DU9 prefix)
 * Excludes: "Defective" categories
 *
 * NOTE: Returns Product type (same as ATS) for unified ProductOrderCard usage.
 * Categories remain SQL-based, but products are fetched from Shopify directly.
 */

import { prisma } from '@/lib/prisma'
import { getPreOrderProductsByCategory } from '@/app/actions/inventory'
import type { Product } from '@/lib/types/inventory'
import { sortBySize } from '@/lib/utils/size-sort'

// ============================================================================
// Types
// ============================================================================

export interface PreOrderCategory {
  id: number
  name: string
  productCount: number
  sortOrder: number
  onRouteStartDate: string | null
  onRouteEndDate: string | null
  imageUrl: string
}

// Legacy types - kept for reference but no longer used
// PreOrderProduct and PreOrderProductVariant have been replaced by Product and ProductVariant

// ============================================================================
// Category Queries
// ============================================================================

/**
 * Get pre-order categories with product counts.
 * Matches .NET: lstSkuCats.FindAll(lc => lc.IsPreOrder.HasValue && lc.IsPreOrder.Value)
 * Excludes: Categories named "Defective"
 */
export async function getPreOrderCategories(): Promise<PreOrderCategory[]> {
  const categories = await prisma.skuCategories.findMany({
    where: {
      IsPreOrder: true,
      Name: { not: 'Defective' },
    },
    orderBy: { SortOrder: 'asc' },
    include: {
      _count: {
        select: { Sku: true },
      },
    },
  })

  return categories
    .map((cat) => ({
      id: cat.ID,
      name: cat.Name,
      productCount: cat._count.Sku,
      sortOrder: cat.SortOrder ?? 10000,
      onRouteStartDate: cat.OnRouteAvailableDate?.toISOString() ?? null,
      onRouteEndDate: cat.OnRouteAvailableDateEnd?.toISOString() ?? null,
      imageUrl: `/SkuImages/${cat.ID}.jpg`,
    }))
    .filter((cat) => cat.productCount > 0)
}

/**
 * Get a single pre-order category by ID.
 * Returns null if category doesn't exist or is not a pre-order category.
 */
export async function getPreOrderCategoryById(
  categoryId: number
): Promise<PreOrderCategory | null> {
  const category = await prisma.skuCategories.findUnique({
    where: { ID: categoryId },
    include: {
      _count: { select: { Sku: true } },
    },
  })

  if (!category || !category.IsPreOrder) return null
  if (category.Name === 'Defective') return null

  return {
    id: category.ID,
    name: category.Name,
    productCount: category._count.Sku,
    sortOrder: category.SortOrder ?? 10000,
    onRouteStartDate: category.OnRouteAvailableDate?.toISOString() ?? null,
    onRouteEndDate: category.OnRouteAvailableDateEnd?.toISOString() ?? null,
    imageUrl: `/SkuImages/${category.ID}.jpg`,
  }
}

// ============================================================================
// Product Queries
// ============================================================================

/**
 * Get pre-order products with variants for a category.
 *
 * Fetches products directly from Shopify API (clean SKUs without DU3/DU9 prefix).
 * Returns Product[] type (same as ATS) for unified ProductOrderCard usage.
 *
 * This function:
 * 1. Looks up the category name from SQL by ID
 * 2. Calls the Shopify API to get products for that category
 */
export async function getPreOrderProductsWithVariants(
  categoryId: number
): Promise<Product[]> {
  // Get category name from SQL database
  const category = await prisma.skuCategories.findUnique({
    where: { ID: categoryId },
    select: { Name: true, IsPreOrder: true },
  })

  if (!category || !category.IsPreOrder) {
    console.log(`Category ${categoryId} not found or not a PreOrder category`)
    return []
  }

  // Fetch products from Shopify API using category name
  try {
    const products = await getPreOrderProductsByCategory(category.Name)

    // Sort variants by size using Limeapple's specific size sequence
    return products.map((product) => ({
      ...product,
      variants: sortBySize(product.variants),
    }))
  } catch (error) {
    console.error(`Error fetching PreOrder products for category ${category.Name}:`, error)
    return []
  }
}
