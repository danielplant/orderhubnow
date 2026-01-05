/**
 * Pre-Order Queries
 * 
 * .NET Reference: PreOrder.aspx.cs
 * 
 * Pre-order categories: IsPreOrder=true
 * Pre-order SKU filter: ShowInPreOrder=true OR Quantity < 1
 * Excludes: "Defective" categories
 */

import { prisma } from '@/lib/prisma'
import { parseSkuId, parsePrice } from '@/lib/utils'
import { isPrepackCategory, getPPSizeDisplayBatch } from '@/lib/utils/ppsize'

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

export interface PreOrderProductVariant {
  sku: string
  size: string
  available: number
  onRoute: number
  priceUsd: number
  priceCad: number
  msrpUsd: number | null
  msrpCad: number | null
  shopifyVariantId: number | null
}

export interface PreOrderProduct {
  id: string
  baseSku: string
  description: string
  imageUrl: string | null
  fabricContent: string | null
  color: string | null
  displayPriority: number
  variants: PreOrderProductVariant[]
}

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

  return categories.map((cat) => ({
    id: cat.ID,
    name: cat.Name,
    productCount: cat._count.Sku,
    sortOrder: cat.SortOrder ?? 10000,
    onRouteStartDate: cat.OnRouteAvailableDate?.toISOString() ?? null,
    onRouteEndDate: cat.OnRouteAvailableDateEnd?.toISOString() ?? null,
    imageUrl: `/SkuImages/${cat.ID}.jpg`,
  }))
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
 * SKU filter: ShowInPreOrder=true OR Quantity < 1
 * Returns OnRoute prominently for pre-order display.
 * Uses PPSize for categories 399, 401.
 */
export async function getPreOrderProductsWithVariants(
  categoryId: number
): Promise<PreOrderProduct[]> {
  // Fetch SKUs matching pre-order criteria
  const skus = await prisma.sku.findMany({
    where: {
      CategoryID: categoryId,
      OR: [
        { ShowInPreOrder: true },
        { Quantity: { lt: 1 } },
      ],
    },
    orderBy: [{ DisplayPriority: 'asc' }, { SkuID: 'asc' }],
    select: {
      SkuID: true,
      Description: true,
      OrderEntryDescription: true,
      Quantity: true,
      OnRoute: true,
      PriceCAD: true,
      PriceUSD: true,
      MSRPCAD: true,
      MSRPUSD: true,
      ShopifyProductVariantId: true,
      ShopifyImageURL: true,
      DisplayPriority: true,
      FabricContent: true,
      SkuColor: true,
    },
  })

  if (skus.length === 0) return []

  // For prepack categories (399, 401), get PPSize display names
  const usePrepackSizing = isPrepackCategory(categoryId)
  let ppSizeMap: Map<string, string> | null = null
  
  if (usePrepackSizing) {
    ppSizeMap = await getPPSizeDisplayBatch(
      skus.map((s) => s.SkuID),
      categoryId
    )
  }

  // Group by base SKU
  const productMap = new Map<
    string,
    {
      description: string
      imageUrl: string | null
      displayPriority: number
      fabricContent: string | null
      color: string | null
      variants: PreOrderProductVariant[]
    }
  >()

  for (const sku of skus) {
    const { baseSku, parsedSize } = parseSkuId(sku.SkuID)
    if (!baseSku) continue

    // Determine size display
    let size: string
    if (usePrepackSizing && ppSizeMap) {
      size = ppSizeMap.get(sku.SkuID) ?? parsedSize
    } else {
      size = parsedSize || 'O/S'
    }

    const variant: PreOrderProductVariant = {
      sku: sku.SkuID,
      size,
      available: sku.Quantity ?? 0,
      onRoute: sku.OnRoute ?? 0,
      priceUsd: parsePrice(sku.PriceUSD),
      priceCad: parsePrice(sku.PriceCAD),
      msrpUsd: sku.MSRPUSD ? parsePrice(sku.MSRPUSD) : null,
      msrpCad: sku.MSRPCAD ? parsePrice(sku.MSRPCAD) : null,
      shopifyVariantId: sku.ShopifyProductVariantId
        ? Number(sku.ShopifyProductVariantId)
        : null,
    }

    if (!productMap.has(baseSku)) {
      productMap.set(baseSku, {
        description:
          sku.OrderEntryDescription ?? sku.Description ?? baseSku,
        imageUrl: sku.ShopifyImageURL ?? null,
        displayPriority: sku.DisplayPriority ?? 10000,
        fabricContent: sku.FabricContent ?? null,
        color: sku.SkuColor ?? null,
        variants: [variant],
      })
    } else {
      productMap.get(baseSku)!.variants.push(variant)
    }
  }

  // Convert to array and sort
  const products: PreOrderProduct[] = Array.from(productMap.entries())
    .map(([baseSku, data]) => ({
      id: baseSku,
      baseSku,
      description: data.description,
      imageUrl: data.imageUrl,
      fabricContent: data.fabricContent,
      color: data.color,
      displayPriority: data.displayPriority,
      variants: data.variants.sort((a, b) => {
        // Sort sizes: numeric first, then alpha
        const aNum = parseInt(a.size, 10)
        const bNum = parseInt(b.size, 10)
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
        if (!isNaN(aNum)) return -1
        if (!isNaN(bNum)) return 1
        return a.size.localeCompare(b.size)
      }),
    }))
    .sort(
      (a, b) =>
        a.displayPriority - b.displayPriority ||
        a.baseSku.localeCompare(b.baseSku)
    )

  return products
}
