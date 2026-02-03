import { prisma } from '@/lib/prisma'
import { getRepsForFilter, getOrderForEditing } from '@/lib/data/queries/orders'
import { isValidReturnTo } from '@/lib/utils/rep-context'
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

  // View-as blocking is handled centrally in buyer layout

  const isPreOrderParam = params.isPreOrder === 'true'
  const editOrderId = params.editOrder
  const returnTo = isValidReturnTo(params.returnTo) ? params.returnTo! : '/buyer/select-journey'
  const draftId = params.draft || null
  
  // Extract rep context for rep-created orders
  const repContext = params.repId ? { repId: params.repId } : null

  // Fetch reps for dropdown and SKU data for cart items
  // Uses Collection data for order splitting (Collection is the source of truth)
  const [reps, skuList] = await Promise.all([
    getRepsForFilter(),
    prisma.sku.findMany({
      select: {
        SkuID: true,
        ShopifyProductVariantId: true,
        PriceCAD: true,
        PriceUSD: true,
        Description: true,
        CollectionID: true,
        Collection: {
          select: {
            name: true,
            shipWindowStart: true,
            shipWindowEnd: true,
          },
        },
        // Fallback for ATS items without CollectionID
        CategoryID: true,
        SkuCategories: {
          select: {
            Name: true,
          },
        },
      },
    }),
  ])

  // Build SKU lookup map for the client
  // Uses Collection for grouping and ship windows
  const skuMap = new Map(
    skuList.map((sku) => [
      sku.SkuID,
      {
        skuVariantId: sku.ShopifyProductVariantId ? Number(sku.ShopifyProductVariantId) : 0,
        priceCAD: parseFloat(sku.PriceCAD || '0'),
        priceUSD: parseFloat(sku.PriceUSD || '0'),
        description: sku.Description || '',
        collectionId: sku.CollectionID ?? null,
        // Use Collection name, fallback to Category name for ATS items
        collectionName: sku.Collection?.name ?? sku.SkuCategories?.Name ?? null,
        shipWindowStart: sku.Collection?.shipWindowStart?.toISOString().slice(0, 10) ?? null,
        shipWindowEnd: sku.Collection?.shipWindowEnd?.toISOString().slice(0, 10) ?? null,
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
