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

  // Validate order ID
  const orderId = parseInt(id, 10)
  if (isNaN(orderId) || orderId <= 0) {
    return NextResponse.json(
      { error: 'Invalid order ID' },
      { status: 400 }
    )
  }

  try {
    // Fetch order with items
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      include: {
        CustomerOrderDetails: {
          select: {
            Sku: true,
            Qty: true,
            Price: true,
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

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
      orderStatus: order.Status || 'Pending',
    }

    // Build line items
    const items = order.CustomerOrderDetails.map((item) => ({
      sku: item.Sku || 'Unknown SKU',
      quantity: item.Qty || 0,
      price: item.Price || 0,
      currency: currency,
      lineTotal: (item.Qty || 0) * (item.Price || 0),
    }))

    // Generate HTML
    const html = generateOrderConfirmationHtml({
      order: orderData,
      items,
    })

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

    // Return PDF response
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
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
