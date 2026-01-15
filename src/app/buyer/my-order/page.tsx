import { prisma } from '@/lib/prisma'
import { getRepsForFilter, getOrderForEditing } from '@/lib/data/queries/orders'
import { MyOrderClient } from './client'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    isPreOrder?: string
    editOrder?: string
    returnTo?: string
    repId?: string
    draft?: string
  }>
}

/**
 * My Order page - server component that fetches data
 * Client component handles cart state and form submission
 *
 * Query params:
 * - isPreOrder=true: Pre-order flow (order prefix "P")
 * - editOrder={id}: Edit existing order mode
 * - returnTo={path}: Redirect path after successful edit/create
 * - repId={id}: Rep context for rep-created orders (auto-selects and locks rep dropdown)
 */
export default async function MyOrderPage({ searchParams }: Props) {
  const params = await searchParams
  const isPreOrderParam = params.isPreOrder === 'true'
  const editOrderId = params.editOrder
  const returnTo = params.returnTo || '/buyer/select-journey'
  const draftId = params.draft || null
  
  // Extract rep context for rep-created orders
  const repContext = params.repId ? { repId: params.repId } : null

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

  // If editing, fetch the existing order
  let existingOrder = null
  if (editOrderId) {
    existingOrder = await getOrderForEditing(editOrderId)
    // If order not found or not editable, existingOrder will be null
  }

  // Use order's isPreOrder when editing, otherwise use URL param
  const isPreOrder = existingOrder?.isPreOrder ?? isPreOrderParam

  return (
    <MyOrderClient
      reps={reps}
      skuMap={Object.fromEntries(skuMap)}
      isPreOrder={isPreOrder}
      existingOrder={existingOrder}
      returnTo={returnTo}
      repContext={repContext}
      draftId={draftId}
    />
  )
}
