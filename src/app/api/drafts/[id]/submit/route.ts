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

    // Determine if this is a pre-order
    const isPreOrder = Object.keys(state.preOrderMeta || {}).length > 0

    // Generate real order number
    const orderNumber = await getNextOrderNumber(isPreOrder)

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

    // Build items for database
    const items: Array<{
      sku: string
      skuVariantId: bigint
      quantity: number
      price: number
    }> = []

    // Look up SKU variant IDs
    const allSkus = Object.values(state.orders).flatMap(skuQtys => Object.keys(skuQtys))
    const skuRecords = await prisma.sku.findMany({
      where: { SkuID: { in: allSkus } },
      select: { ID: true, SkuID: true },
    })
    const skuIdMap = new Map(skuRecords.map(s => [s.SkuID, s.ID]))

    for (const [, skuQtys] of Object.entries(state.orders)) {
      for (const [sku, qty] of Object.entries(skuQtys as Record<string, number>)) {
        if (qty > 0) {
          items.push({
            sku,
            skuVariantId: BigInt(skuIdMap.get(sku) || 0),
            quantity: qty,
            price: state.prices[sku] || 0,
          })
        }
      }
    }

    // Update draft to real order in transaction
    const currency = formData.currency || 'CAD'

    await prisma.$transaction(async (tx) => {
      // Update order header
      await tx.customerOrders.update({
        where: { ID: draft.ID },
        data: {
          OrderNumber: orderNumber,
          OrderStatus: 'Pending',
          BuyerName: formData.buyerName,
          StoreName: formData.storeName,
          SalesRep: salesRepName,
          CustomerEmail: formData.customerEmail,
          CustomerPhone: formData.customerPhone,
          Country: currency,
          OrderAmount: orderAmount,
          OrderNotes: formData.orderNotes || '',
          CustomerPO: formData.customerPO || '',
          ShipStartDate: new Date(formData.shipStartDate),
          ShipEndDate: new Date(formData.shipEndDate),
          OrderDate: new Date(),
          Website: formData.website || '',
          IsShipped: false,
          IsTransferredToShopify: false,
          RepID: parseInt(formData.salesRepId),
          CustomerID: customerId,
        },
      })

      // Create order items
      await tx.customerOrdersItems.createMany({
        data: items.map(item => ({
          CustomerOrderID: draft.ID,
          OrderNumber: orderNumber,
          SKU: item.sku,
          SKUVariantID: item.skuVariantId,
          Quantity: item.quantity,
          Price: item.price,
          PriceCurrency: currency,
          Notes: '',
        })),
      })
    })

    // Send confirmation emails (non-blocking)
    sendOrderEmails({
      orderId: String(draft.ID),
      orderNumber,
      storeName: formData.storeName,
      buyerName: formData.buyerName,
      salesRep: salesRepName,
      customerEmail: formData.customerEmail,
      customerPhone: formData.customerPhone,
      shipStartDate: new Date(formData.shipStartDate),
      shipEndDate: new Date(formData.shipEndDate),
      orderDate: new Date(),
      orderNotes: formData.orderNotes,
      customerPO: formData.customerPO,
      items: items.map(i => ({
        sku: i.sku,
        quantity: i.quantity,
        price: i.price,
        lineTotal: i.price * i.quantity,
      })),
      currency,
      orderAmount,
    }).catch(err => {
      console.error('Failed to send order emails:', err)
    })

    return NextResponse.json({
      success: true,
      orderId: String(draft.ID),
      orderNumber,
    })
  } catch (error) {
    console.error('Submit draft error:', error)
    return NextResponse.json(
      { error: 'Failed to submit order' },
      { status: 500 }
    )
  }
}
