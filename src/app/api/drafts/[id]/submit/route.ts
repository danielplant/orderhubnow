import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendOrderEmails } from '@/lib/email/send-order-emails'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Generate next order number with A (ATS) or P (Pre-Order) prefix.
 * Replicates logic from orders.ts for draft submission.
 */
async function getNextOrderNumber(isPreOrder: boolean): Promise<string> {
  const prefix = isPreOrder ? 'P' : 'A'
  const defaultStart = 10001

  try {
    const result = await prisma.$queryRaw<[{ OrderNumber: string }]>`
      DECLARE @OrderNumber NVARCHAR(50);
      EXEC [dbo].[uspGetNextOrderNumber] @Prefix = ${prefix}, @OrderNumber = @OrderNumber OUTPUT;
      SELECT @OrderNumber AS OrderNumber;
    `
    if (result?.[0]?.OrderNumber) {
      return result[0].OrderNumber
    }
  } catch {
    // SP not available, use fallback
  }

  // Fallback
  const lastOrder = await prisma.customerOrders.findFirst({
    where: { OrderNumber: { startsWith: prefix } },
    orderBy: { ID: 'desc' },
    select: { OrderNumber: true },
  })

  if (!lastOrder?.OrderNumber) {
    return `${prefix}${defaultStart}`
  }

  const lastNumber = parseInt(lastOrder.OrderNumber.replace(prefix, ''), 10)
  return `${prefix}${lastNumber + 1}`
}

/**
 * Derive order type (ATS vs Pre-Order) from SKU data.
 * Master source: Collection.type
 */
async function deriveIsPreOrderFromSkus(
  skuVariantIds: bigint[]
): Promise<Map<string, boolean>> {
  if (skuVariantIds.length === 0) {
    return new Map()
  }

  const skus = await prisma.sku.findMany({
    where: { ID: { in: skuVariantIds } },
    select: {
      ID: true,
      CollectionID: true,
      Collection: {
        select: { type: true },
      },
    },
  })

  const result = new Map<string, boolean>()
  for (const sku of skus) {
    // Use Collection.type to determine pre-order status
    const isPreOrder = sku.Collection?.type === 'PreOrder'
    result.set(String(sku.ID), isPreOrder)
  }

  return result
}

/**
 * Get order grouping key that includes both Collection AND order type.
 * This ensures ATS and Pre-Order items are split into separate orders.
 * 
 * Grouping: CollectionID → default
 * (No CategoryID fallback - Collection is the source of truth)
 */
function getOrderGroupKey(
  item: {
    collectionId?: number | null
    skuVariantId: bigint
  },
  skuPreOrderMap: Map<string, boolean>
): string {
  const isPreOrder = skuPreOrderMap.get(String(item.skuVariantId)) ?? false
  const typePrefix = isPreOrder ? 'preorder' : 'ats'
  
  // Group by order type first, then by collection
  if (item.collectionId) {
    return `${typePrefix}-collection-${item.collectionId}`
  }
  return `${typePrefix}-default`
}

/**
 * POST /api/drafts/[id]/submit - Convert draft to real order
 * 
 * No authentication required - drafts are public/shareable.
 * 
 * This:
 * 1. Validates the draft has required fields
 * 2. Generates a real order number (A or P prefix)
 * 3. Creates CustomerOrdersItems from cart state
 * 4. Changes status from Draft to Pending
 * 5. Sends confirmation emails
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    // Get draft
    const draft = await prisma.customerOrders.findFirst({
      where: {
        OrderNumber: id,
        OrderStatus: 'Draft',
      },
    })

    if (!draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Parse draft state
    let state: {
      orders: Record<string, Record<string, number>>
      prices: Record<string, number>
      preOrderMeta: Record<string, unknown>
      lineMeta: Record<string, unknown>
      formData?: Record<string, string>
    }

    try {
      state = JSON.parse(draft.OrderNotes || '{}')
    } catch {
      return NextResponse.json(
        { error: 'Invalid draft state' },
        { status: 400 }
      )
    }

    // Merge body formData with stored formData (body takes precedence)
    const formData = {
      ...state.formData,
      ...body.formData,
    }

    // Validate required fields
    const required = [
      'storeName', 'buyerName', 'customerEmail', 'customerPhone',
      'salesRepId', 'street1', 'city', 'stateProvince', 'zipPostal', 'country',
      'shippingStreet1', 'shippingCity', 'shippingStateProvince', 'shippingZipPostal', 'shippingCountry',
      'shipStartDate', 'shipEndDate',
    ]

    const missing = required.filter(f => !formData[f])
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate cart has items
    const hasItems = Object.values(state.orders || {}).some(
      skuQtys => Object.values(skuQtys).some(qty => qty > 0)
    )
    if (!hasItems) {
      return NextResponse.json(
        { error: 'Cart is empty' },
        { status: 400 }
      )
    }

    // NOTE: Order type will be derived from SKU data below, not preOrderMeta

    // Look up rep name
    const rep = await prisma.reps.findUnique({
      where: { ID: parseInt(formData.salesRepId) },
      select: { Name: true },
    })
    const salesRepName = rep?.Name || 'Unknown Rep'

    // Look up or create customer
    let customerId: number | null = null
    const existingCustomer = await prisma.customers.findFirst({
      where: { StoreName: formData.storeName },
      select: { ID: true },
    })
    if (existingCustomer) {
      customerId = existingCustomer.ID
    }

    // Calculate order amount
    let orderAmount = 0
    for (const [, skuQtys] of Object.entries(state.orders)) {
      for (const [sku, qty] of Object.entries(skuQtys as Record<string, number>)) {
        const price = state.prices[sku] || 0
        orderAmount += price * qty
      }
    }

    // Build items for database with Collection ship window metadata
    const items: Array<{
      sku: string
      skuVariantId: bigint
      quantity: number
      price: number
      collectionId: number | null
      collectionName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
    }> = []

    // Look up SKU data including Collection (source of truth)
    const allSkus = Object.values(state.orders).flatMap(skuQtys => Object.keys(skuQtys))
    const skuRecords = await prisma.sku.findMany({
      where: { SkuID: { in: allSkus } },
      select: {
        ID: true,
        SkuID: true,
        CollectionID: true,
        Collection: {
          select: {
            name: true,
            type: true,
            shipWindowStart: true,
            shipWindowEnd: true,
          },
        },
      },
    })
    const skuDataMap = new Map(skuRecords.map(s => [s.SkuID, s]))
    
    // Build pre-order map from Collection.type
    const skuPreOrderMap = new Map<string, boolean>()
    for (const sku of skuRecords) {
      skuPreOrderMap.set(String(sku.ID), sku.Collection?.type === 'PreOrder')
    }

    for (const [, skuQtys] of Object.entries(state.orders)) {
      for (const [sku, qty] of Object.entries(skuQtys as Record<string, number>)) {
        if (qty > 0) {
          const skuData = skuDataMap.get(sku)
          items.push({
            sku,
            skuVariantId: BigInt(skuData?.ID || 0),
            quantity: qty,
            price: state.prices[sku] || 0,
            collectionId: skuData?.CollectionID ?? null,
            collectionName: skuData?.Collection?.name ?? null,
            shipWindowStart: skuData?.Collection?.shipWindowStart?.toISOString() ?? null,
            shipWindowEnd: skuData?.Collection?.shipWindowEnd?.toISOString() ?? null,
          })
        }
      }
    }

    // Group items by order type AND ship window (auto-split mixed ATS/Pre-Order)
    const itemGroups = new Map<string, typeof items>()
    for (const item of items) {
      const key = getOrderGroupKey(item, skuPreOrderMap)
      if (!itemGroups.has(key)) {
        itemGroups.set(key, [])
      }
      itemGroups.get(key)!.push(item)
    }

    const currency = formData.currency || 'CAD'

    // Track created orders
    const createdOrders: Array<{
      orderId: string
      orderNumber: string
      collectionName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
      orderAmount: number
      items: typeof items
    }> = []

    await prisma.$transaction(async (tx) => {
      // Delete the draft first (we'll create new orders)
      await tx.customerOrdersItems.deleteMany({
        where: { CustomerOrderID: draft.ID },
      })
      await tx.customerOrders.delete({
        where: { ID: draft.ID },
      })

      // Create one order per ship window group (and order type)
      for (const [, groupItems] of itemGroups) {
        // Derive order type from first item's SKU (all items in group have same type)
        const firstItemVariantId = String(groupItems[0].skuVariantId)
        const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false
        const groupOrderNumber = await getNextOrderNumber(isPreOrder)
        const groupAmount = groupItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

        // Use item's ship window if available, else form dates
        const firstItem = groupItems[0]
        const shipStart = firstItem.shipWindowStart
          ? new Date(firstItem.shipWindowStart)
          : new Date(formData.shipStartDate)
        const shipEnd = firstItem.shipWindowEnd
          ? new Date(firstItem.shipWindowEnd)
          : new Date(formData.shipEndDate)

        // Create order header
        const newOrder = await tx.customerOrders.create({
          data: {
            OrderNumber: groupOrderNumber,
            OrderStatus: 'Pending',
            BuyerName: formData.buyerName,
            StoreName: formData.storeName,
            SalesRep: salesRepName,
            CustomerEmail: formData.customerEmail,
            CustomerPhone: formData.customerPhone,
            Country: currency,
            OrderAmount: groupAmount,
            OrderNotes: formData.orderNotes || '',
            CustomerPO: formData.customerPO || '',
            ShipStartDate: shipStart,
            ShipEndDate: shipEnd,
            OrderDate: new Date(),
            Website: formData.website || '',
            IsShipped: false,
            IsTransferredToShopify: false,
            IsPreOrder: isPreOrder, // Derived from SKU category, not preOrderMeta
            RepID: parseInt(formData.salesRepId),
            CustomerID: customerId,
          },
        })

        // Create order items for this group
        await tx.customerOrdersItems.createMany({
          data: groupItems.map(item => ({
            CustomerOrderID: newOrder.ID,
            OrderNumber: groupOrderNumber,
            SKU: item.sku,
            SKUVariantID: item.skuVariantId,
            Quantity: item.quantity,
            Price: item.price,
            PriceCurrency: currency,
            Notes: '',
          })),
        })

        createdOrders.push({
          orderId: String(newOrder.ID),
          orderNumber: groupOrderNumber,
          collectionName: firstItem.collectionName,
          shipWindowStart: firstItem.shipWindowStart,
          shipWindowEnd: firstItem.shipWindowEnd,
          orderAmount: groupAmount,
          items: groupItems,
        })
      }
    })

    // Send confirmation emails for each created order (non-blocking)
    for (const order of createdOrders) {
      sendOrderEmails({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        storeName: formData.storeName,
        buyerName: formData.buyerName,
        salesRep: salesRepName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        shipStartDate: order.shipWindowStart ? new Date(order.shipWindowStart) : new Date(formData.shipStartDate),
        shipEndDate: order.shipWindowEnd ? new Date(order.shipWindowEnd) : new Date(formData.shipEndDate),
        orderDate: new Date(),
        orderNotes: formData.orderNotes,
        customerPO: formData.customerPO,
        items: order.items.map(i => ({
          sku: i.sku,
          quantity: i.quantity,
          price: i.price,
          lineTotal: i.price * i.quantity,
        })),
        currency,
        orderAmount: order.orderAmount,
      }).catch(err => {
        console.error(`Failed to send order emails for ${order.orderNumber}:`, err)
      })
    }

    // Return first order for backwards compatibility, plus full orders array
    const primaryOrder = createdOrders[0]
    return NextResponse.json({
      success: true,
      orderId: primaryOrder?.orderId,
      orderNumber: primaryOrder?.orderNumber,
      orders: createdOrders.map(o => ({
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        collectionName: o.collectionName,
        shipWindowStart: o.shipWindowStart,
        shipWindowEnd: o.shipWindowEnd,
      })),
    })
  } catch (error) {
    console.error('Submit draft error:', error)
    return NextResponse.json(
      { error: 'Failed to submit order' },
      { status: 500 }
    )
  }
}
