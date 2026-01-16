/**
 * Resend Order Email API Endpoint
 *
 * Resends order confirmation or sales notification emails.
 * Requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { sendOrderEmails } from '@/lib/email/send-order-emails'
import { logEmailSent } from '@/lib/audit/activity-logger'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Require admin auth
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const orderId = parseInt(id, 10)

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid order ID' }, { status: 400 })
    }

    const body = await request.json()
    const { type } = body // 'customer' | 'sales' | 'both'

    if (!type || !['customer', 'sales', 'both'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid email type' }, { status: 400 })
    }

    // Fetch order details
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        OrderNumber: true,
        StoreName: true,
        BuyerName: true,
        SalesRep: true,
        CustomerEmail: true,
        CustomerPhone: true,
        Country: true,
        OrderAmount: true,
        OrderNotes: true,
        CustomerPO: true,
        ShipStartDate: true,
        ShipEndDate: true,
        OrderDate: true,
      },
    })

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    // Get order items
    const items = await prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
      select: {
        SKU: true,
        Quantity: true,
        Price: true,
      },
    })

    // Determine currency
    const currency: 'USD' | 'CAD' = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'

    // Get rep email if available
    let repEmail: string | undefined
    if (order.SalesRep) {
      const rep = await prisma.reps.findFirst({
        where: { Name: order.SalesRep },
        select: { Email1: true, Email2: true },
      })
      repEmail = rep?.Email1 || rep?.Email2 || undefined
    }

    // Prepare email data
    const emailData = {
      orderId: order.ID.toString(),
      orderNumber: order.OrderNumber,
      storeName: order.StoreName,
      buyerName: order.BuyerName,
      customerEmail: order.CustomerEmail || '',
      customerPhone: order.CustomerPhone || '',
      salesRep: order.SalesRep || '',
      orderAmount: order.OrderAmount,
      currency,
      shipStartDate: order.ShipStartDate || new Date(),
      shipEndDate: order.ShipEndDate || new Date(),
      orderDate: order.OrderDate,
      orderNotes: order.OrderNotes || '',
      customerPO: order.CustomerPO || '',
      items: items.map((item) => ({
        sku: item.SKU,
        quantity: item.Quantity,
        price: item.Price,
        lineTotal: item.Price * item.Quantity,
      })),
    }

    // Send emails based on type
    const result = await sendOrderEmails(emailData, false)

    // Log email sends
    const adminUser = session.user.name || session.user.email || 'Admin'

    if ((type === 'customer' || type === 'both') && result.customerEmailSent) {
      await logEmailSent({
        entityType: 'order',
        entityId: order.ID.toString(),
        orderId: order.ID.toString(),
        orderNumber: order.OrderNumber,
        emailType: 'order_confirmation',
        recipient: order.CustomerEmail || '',
        performedBy: adminUser,
      })
    }

    if ((type === 'sales' || type === 'both') && result.salesEmailSent) {
      await logEmailSent({
        entityType: 'order',
        entityId: order.ID.toString(),
        orderId: order.ID.toString(),
        orderNumber: order.OrderNumber,
        emailType: 'sales_notification',
        recipient: repEmail || 'Sales Team',
        performedBy: adminUser,
      })
    }

    return NextResponse.json({
      success: true,
      results: {
        customer: result.customerEmailSent,
        sales: result.salesEmailSent,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (error) {
    console.error('Resend email error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
