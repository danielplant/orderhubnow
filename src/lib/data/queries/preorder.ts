/**
 * Pre-Order Queries
 *
 * .NET Reference: PreOrder.aspx.cs
 *
 * Pre-order categories: IsPreOrder=true (from SQL)
 * Pre-order products: NOW fetched from SQL Sku table (clean SKUs, no DU3/DU9 prefix)
 * Excludes: "Defective" categories
 *
 * NOTE: Returns Product type (same as ATS) for unified ProductOrderCard usage.
 * Both categories and products are now SQL-based after Shopify sync.
 */

import { prisma } from '@/lib/prisma'
import type { Product, ProductVariant } from '@/lib/types/inventory'
import { sortBySize, extractSize } from '@/lib/utils/size-sort'

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
 * Extract base SKU from full SKU.
 * e.g., "744-MU-7/8" → "744-MU" (base), "7/8" (size)
 */
function extractBaseSku(fullSku: string): string {
  // Find the last dash that separates base from size
  const lastDashIndex = fullSku.lastIndexOf('-')
  if (lastDashIndex === -1) return fullSku
  return fullSku.substring(0, lastDashIndex)
}

/**
 * Get pre-order products with variants for a category.
 *
 * NOW fetches from SQL Sku table (clean SKUs without DU3/DU9 prefix).
 * Returns Product[] type (same as ATS) for unified ProductOrderCard usage.
 *
 * This function:
 * 1. Queries Sku table with ShowInPreOrder=true and CategoryID
 * 2. Groups variants by base SKU
 * 3. Returns unified Product[] format
 */
export async function getPreOrderProductsWithVariants(
  categoryId: number
): Promise<Product[]> {
  // Verify category exists and is PreOrder
  const category = await prisma.skuCategories.findUnique({
    where: { ID: categoryId },
    select: { Name: true, IsPreOrder: true },
  })

  if (!category || !category.IsPreOrder) {
    console.log(`Category ${categoryId} not found or not a PreOrder category`)
    return []
  }

  // Fetch SKUs from SQL database
  const skus = await prisma.sku.findMany({
    where: {
      CategoryID: categoryId,
      ShowInPreOrder: true,
    },
    orderBy: [{ DisplayPriority: 'asc' }, { SkuID: 'asc' }],
  })

  if (skus.length === 0) {
    console.log(`No PreOrder SKUs found for category ${categoryId}`)
    return []
  }

  // Group SKUs by base SKU + image URL to split cards when images differ
  // This handles cases where Kids and Ladies variants share the same SKU prefix
  // but have different product images
  const productMap = new Map<
    string,
    {
      skus: typeof skus
      baseSku: string
    }
  >()

  for (const sku of skus) {
    const baseSku = extractBaseSku(sku.SkuID)
    const imageUrl = sku.ShopifyImageURL ?? ''
    const groupKey = `${baseSku}::${imageUrl}`

    if (!productMap.has(groupKey)) {
      productMap.set(groupKey, { skus: [], baseSku })
    }
    productMap.get(groupKey)!.skus.push(sku)
  }

  // Convert to Product[] format
  const products: Product[] = []

  for (const [groupKey, { skus: variantSkus, baseSku }] of productMap) {
    // Use first variant for product-level data
    const firstSku = variantSkus[0]

    // Parse prices from strings
    const parsePriceFromString = (priceStr: string | null): number => {
      if (!priceStr) return 0
      const num = parseFloat(priceStr)
      return isNaN(num) ? 0 : num
    }

    // Build variants - extract clean size from variant title (removes color suffix)
    const variants: ProductVariant[] = variantSkus.map((sku) => ({
      size: extractSize(sku.Size || ''),
      sku: sku.SkuID,
      available: sku.Quantity ?? 0,
      onRoute: sku.OnRoute ?? 0,
      priceCad: parsePriceFromString(sku.PriceCAD),
      priceUsd: parsePriceFromString(sku.PriceUSD),
      status: 'preorder' as const,
    }))

    // Use groupKey as ID to ensure uniqueness when baseSku has multiple image variants
    products.push({
      id: groupKey,
      skuBase: baseSku,
      title: firstSku.OrderEntryDescription || firstSku.Description || baseSku,
      fabric: firstSku.FabricContent || '',
      color: firstSku.SkuColor || '',
      priceCad: parsePriceFromString(firstSku.PriceCAD),
      priceUsd: parsePriceFromString(firstSku.PriceUSD),
      msrpCad: parsePriceFromString(firstSku.MSRPCAD),
      msrpUsd: parsePriceFromString(firstSku.MSRPUSD),
      imageUrl: firstSku.ShopifyImageURL || `/SkuImages/${baseSku}.jpg`,
      variants: sortBySize(variants),
    })
  }

  return products
}
