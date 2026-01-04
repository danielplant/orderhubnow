import { prisma } from '@/lib/prisma'
import { getRepsForFilter } from '@/lib/data/queries/orders'
import { MyOrderClient } from './client'

/**
 * My Order page - server component that fetches data
 * Client component handles cart state and form submission
 */
export default async function MyOrderPage() {
  // Fetch reps for dropdown and SKU data for cart items
  const [reps, skuList] = await Promise.all([
    getRepsForFilter(),
    prisma.sku.findMany({
      select: {
        SkuID: true,
        ShopifyProductVariantId: true,
        PriceCAD: true,
        PriceUSD: true,
        Description: true,
      },
    }),
  ])

  // Build SKU lookup map for the client
  const skuMap = new Map(
    skuList.map((sku) => [
      sku.SkuID,
      {
        skuVariantId: sku.ShopifyProductVariantId ? Number(sku.ShopifyProductVariantId) : 0,
        priceCAD: parseFloat(sku.PriceCAD || '0'),
        priceUSD: parseFloat(sku.PriceUSD || '0'),
        description: sku.Description || '',
      },
    ])
  )

  return <MyOrderClient reps={reps} skuMap={Object.fromEntries(skuMap)} />
}
