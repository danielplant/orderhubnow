/**
 * Order PDF Confirmation API
 *
 * GET /api/orders/[id]/pdf
 * Returns a PDF confirmation for the specified order.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePdf } from '@/lib/pdf/generate'
import { generateOrderConfirmationHtml } from '@/lib/pdf/order-confirmation'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { id } = await context.params
  const debugMode = request.nextUrl.searchParams.get('debug')

  // Validate order ID
  const orderId = parseInt(id, 10)
  console.log('PDF Request for order:', orderId)

  if (isNaN(orderId) || orderId <= 0) {
    return NextResponse.json(
      { error: 'Invalid order ID' },
      { status: 400 }
    )
  }

  try {
    // Fetch order
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
    })

    console.log('Order found:', order ? 'yes' : 'no')

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Fetch order items separately (no relation defined in schema)
    const orderItems = await prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
    })

    console.log('Order items count:', orderItems.length)

    // Determine currency from Country field (legacy behavior)
    const currency = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'

    // Build order data for PDF
    const orderData = {
      orderNumber: order.OrderNumber || `#${orderId}`,
      storeName: order.StoreName || 'Unknown Store',
      buyerName: order.BuyerName || order.StoreName || 'Unknown',
      salesRep: order.SalesRep || 'N/A',
      customerEmail: order.CustomerEmail || '',
      customerPhone: order.CustomerPhone || '',
      currency: currency as 'USD' | 'CAD',
      orderAmount: order.OrderAmount || 0,
      orderNotes: order.OrderNotes || '',
      customerPO: order.CustomerPO || '',
      shipStartDate: order.ShipStartDate || new Date(),
      shipEndDate: order.ShipEndDate || new Date(),
      orderDate: order.OrderDate || new Date(),
      website: order.Website || '',
      orderStatus: order.OrderStatus || 'Pending',
    }

    // Build line items
    const items = orderItems.map((item) => ({
      sku: item.SKU || 'Unknown SKU',
      quantity: item.Quantity || 0,
      price: item.Price || 0,
      currency: currency,
      lineTotal: (item.Quantity || 0) * (item.Price || 0),
    }))

    // Generate HTML
    const html = generateOrderConfirmationHtml({
      order: orderData,
      items,
    })

    console.log('HTML length:', html.length)

    // DEBUG MODE: Return raw HTML instead of PDF
    if (debugMode === 'html') {
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // Generate PDF (portrait orientation for confirmation)
    const pdfBuffer = await generatePdf(html, {
      format: 'Letter',
      landscape: false,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
    })

    // Build filename
    const filename = `${order.OrderNumber || orderId}-Confirmation.pdf`

    // Return PDF response - convert Uint8Array to Buffer
    const buffer = Buffer.from(pdfBuffer)
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
