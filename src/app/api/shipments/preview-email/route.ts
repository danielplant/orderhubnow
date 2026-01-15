/**
 * Email Preview API
 * 
 * POST /api/shipments/preview-email
 * Generates email HTML preview without sending.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { shipmentConfirmationHtml, type ShipmentEmailData } from '@/lib/email/shipment-templates'
import { getTrackingUrl } from '@/lib/types/shipment'
import type { Carrier } from '@/lib/types/shipment'

interface PreviewEmailRequest {
  orderId: string
  items: Array<{
    orderItemId: string
    quantityShipped: number
    priceOverride?: number
  }>
  shippingCost: number
  carrier?: Carrier
  trackingNumber?: string
  shipDate: string
  customerEmail: string
  attachInvoice?: boolean
  attachPackingSlip?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: PreviewEmailRequest = await request.json()

    // Fetch order details
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(body.orderId) },
      select: {
        OrderNumber: true,
        StoreName: true,
        BuyerName: true,
        SalesRep: true,
        OrderAmount: true,
        Country: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Fetch order items for the selected items
    const orderItemIds = body.items.map((i) => BigInt(i.orderItemId))
    const orderItems = await prisma.customerOrdersItems.findMany({
      where: { ID: { in: orderItemIds } },
      select: {
        ID: true,
        SKU: true,
        Price: true,
      },
    })

    const itemMap = new Map(orderItems.map((item) => [item.ID.toString(), item]))

    // Build items for email
    const emailItems: ShipmentEmailData['items'] = []
    let subtotal = 0

    for (const inputItem of body.items) {
      const orderItem = itemMap.get(inputItem.orderItemId)
      if (!orderItem) continue

      const unitPrice = inputItem.priceOverride ?? orderItem.Price
      const lineTotal = unitPrice * inputItem.quantityShipped
      subtotal += lineTotal

      emailItems.push({
        sku: orderItem.SKU,
        productName: orderItem.SKU, // In preview, just use SKU
        quantity: inputItem.quantityShipped,
        unitPrice,
        lineTotal,
      })
    }

    const shipmentTotal = subtotal + body.shippingCost
    const currency: 'USD' | 'CAD' = order.Country === 'Canada' ? 'CAD' : 'USD'

    // Get existing shipments to calculate shipment number
    const existingShipments = await prisma.shipments.count({
      where: { CustomerOrderID: BigInt(body.orderId) },
    })
    const shipmentNumber = existingShipments + 1

    // Build tracking URL if tracking provided
    const trackingUrl = body.trackingNumber && body.carrier
      ? getTrackingUrl(body.carrier, body.trackingNumber) || undefined
      : undefined

    // Build email data
    const emailData: ShipmentEmailData = {
      orderNumber: order.OrderNumber,
      storeName: order.StoreName,
      buyerName: order.BuyerName,
      customerEmail: body.customerEmail,
      salesRep: order.SalesRep,
      shipmentNumber,
      totalShipments: shipmentNumber, // Preview assumes this is the only/latest shipment
      shipDate: new Date(body.shipDate),
      carrier: body.carrier,
      trackingNumber: body.trackingNumber,
      trackingUrl,
      items: emailItems,
      currency,
      subtotal,
      shippingCost: body.shippingCost,
      shipmentTotal,
      orderTotal: order.OrderAmount,
      previouslyShipped: 0, // Simplified for preview
      remainingBalance: order.OrderAmount - shipmentTotal,
      orderTrackingUrl: '[Order tracking link will be generated]',
    }

    // Generate HTML
    const html = shipmentConfirmationHtml(emailData)

    // Build subject
    const subject = shipmentNumber > 1
      ? `Your order ${order.OrderNumber} has shipped! (Shipment ${shipmentNumber})`
      : `Your order ${order.OrderNumber} has shipped!`

    // Build attachment list
    const attachments: string[] = []
    if (body.attachInvoice) attachments.push('Invoice PDF')
    if (body.attachPackingSlip) attachments.push('Packing Slip PDF')

    return NextResponse.json({
      subject,
      html,
      attachments,
      to: body.customerEmail,
      from: 'orders@limeapple.com',
    })
  } catch (error) {
    console.error('Email preview error:', error)
    return NextResponse.json(
      { error: 'Failed to generate email preview' },
      { status: 500 }
    )
  }
}
