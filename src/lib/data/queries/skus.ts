import { prisma } from '@/lib/prisma'
import { parsePrice, parseSkuId } from '@/lib/utils'
import type { Product, ProductVariant } from '@/lib/types'

/**
 * Get SKUs by category ID, grouped into Products
 * Uses parseSkuId() to extract BaseSku and ParsedSize from SkuID (matching .NET logic)
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

  // Group SKUs by BaseSku (parsed via JS helper)
  const grouped = new Map<string, Array<typeof skus[0] & { baseSku: string; parsedSize: string }>>()
  
  for (const sku of skus) {
    const { baseSku, parsedSize } = parseSkuId(sku.SkuID)
    const skuWithParsed = { ...sku, baseSku, parsedSize }
    if (!grouped.has(baseSku)) {
      grouped.set(baseSku, [])
    }
    grouped.get(baseSku)!.push(skuWithParsed)
  }

  // Transform each group into a Product
  const products: Product[] = []

  for (const [baseSku, skuGroup] of grouped) {
    const first = skuGroup[0]
    
    const variants: ProductVariant[] = skuGroup.map(sku => ({
      size: sku.parsedSize,
      sku: sku.SkuID,
      available: sku.Quantity ?? 0,
      onRoute: sku.OnRoute ?? 0,
      priceCad: parsePrice(sku.PriceCAD),
      priceUsd: parsePrice(sku.PriceUSD),
    }))

    products.push({
      id: baseSku,
      skuBase: baseSku,
      title: first.OrderEntryDescription ?? first.Description ?? baseSku,
      fabric: first.FabricContent ?? '',
      color: first.SkuColor ?? '',
      priceCad: parsePrice(first.PriceCAD),
      priceUsd: parsePrice(first.PriceUSD),
      msrpCad: parsePrice(first.MSRPCAD),
      msrpUsd: parsePrice(first.MSRPUSD),
      imageUrl: first.ShopifyImageURL ?? '',
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
