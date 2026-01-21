import { prisma } from '@/lib/prisma'
import { parsePrice, parseSkuId, resolveColor } from '@/lib/utils'
import { sortBySize, extractSize } from '@/lib/utils/size-sort'
import type { Product, ProductVariant } from '@/lib/types'

/**
 * Get SKUs by category ID, grouped into Products
 * Uses sku.Size field (from Shopify selectedOptions) as canonical size source
 */
export async function getSkusByCategory(categoryId: number): Promise<Product[]> {
  const skus = await prisma.sku.findMany({
    where: {
      CategoryID: categoryId,
      ShowInPreOrder: false,
      OR: [
        { Quantity: { gte: 1 } },
        { OnRoute: { gt: 0 } }
      ]
    },
    orderBy: [
      { DisplayPriority: 'asc' },
      { SkuID: 'asc' }
    ]
  })

  // Group SKUs by BaseSku + ImageURL to split cards when images differ
  // This handles cases where Kids and Ladies variants share the same SKU prefix
  // but have different product images (e.g., 600C-BLK kids vs 600C-BLK ladies)
  const grouped = new Map<string, Array<typeof skus[0] & { baseSku: string; size: string }>>()

  for (const sku of skus) {
    const { baseSku } = parseSkuId(sku.SkuID)
    const size = extractSize(sku.Size || '')
    const skuWithParsed = { ...sku, baseSku, size }

    // Use composite key: baseSku + image URL
    const imageUrl = sku.ShopifyImageURL ?? ''
    const groupKey = `${baseSku}::${imageUrl}`

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, [])
    }
    grouped.get(groupKey)!.push(skuWithParsed)
  }

  // Transform each group into a Product
  const products: Product[] = []

  for (const [groupKey, skuGroup] of grouped) {
    const first = skuGroup[0]
    const baseSku = first.baseSku

    // Map variants and sort by size using Limeapple's specific size sequence
    const variants: ProductVariant[] = sortBySize(
      skuGroup.map(sku => ({
        size: sku.size,
        sku: sku.SkuID,
        available: sku.Quantity ?? 0,
        onRoute: sku.OnRoute ?? 0,
        priceCad: parsePrice(sku.PriceCAD),
        priceUsd: parsePrice(sku.PriceUSD),
      }))
    )

    // Use groupKey as ID to ensure uniqueness when baseSku has multiple image variants
    const title = first.OrderEntryDescription ?? first.Description ?? baseSku
    products.push({
      id: groupKey,
      skuBase: baseSku,
      title,
      fabric: first.FabricContent ?? '',
      color: resolveColor(first.SkuColor, first.SkuID, title),
      productType: first.ProductType ?? '',
      priceCad: parsePrice(first.PriceCAD),
      priceUsd: parsePrice(first.PriceUSD),
      msrpCad: parsePrice(first.MSRPCAD),
      msrpUsd: parsePrice(first.MSRPUSD),
      imageUrl: first.ShopifyImageURL ?? '',
      thumbnailPath: first.ThumbnailPath ?? null,
      variants,
    })
  }

  return products
}

/**
 * Get category name by ID
 */
export async function getCategoryName(categoryId: number): Promise<string | null> {
  const category = await prisma.skuCategories.findUnique({
    where: { ID: categoryId },
    select: { Name: true }
  })
  return category?.Name ?? null
}
