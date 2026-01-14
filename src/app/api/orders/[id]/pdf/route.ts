/**
 * Order PDF Confirmation API
 *
 * GET /api/orders/[id]/pdf
 * Returns a PDF order confirmation with optional detailed appendix.
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

    // Fetch order items
    const orderItems = await prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
    })

    console.log('Order items count:', orderItems.length)

    // Fetch SKU details for each order item (image, size, description, category)
    // Order items may have prefixes (e.g., "DU92PC-582P-GH-7/8") that don't exist in Sku table ("582P-GH-7/8")
    // So we need to try multiple matching strategies
    const skuIds = orderItems.map((item) => item.SKU).filter(Boolean)

    // Build a list of potential SKU IDs to search for (exact + normalized versions)
    const potentialSkuIds = new Set<string>()
    const skuNormalizationMap = new Map<string, string>() // normalized -> original order item SKU

    for (const orderSkuId of skuIds) {
      // Add exact match
      potentialSkuIds.add(orderSkuId)

      // Try stripping common prefixes (DU9, 2PC-, etc.)
      // Pattern: often has format like "DU92PC-582P-GH-7/8" where "582P-GH-7/8" is the Sku table ID
      const parts = orderSkuId.split('-')
      for (let i = 0; i < parts.length; i++) {
        const suffix = parts.slice(i).join('-')
        if (suffix && suffix !== orderSkuId) {
          potentialSkuIds.add(suffix)
          skuNormalizationMap.set(suffix, orderSkuId)
        }
      }
    }

    const skus = await prisma.sku.findMany({
      where: { SkuID: { in: Array.from(potentialSkuIds) } },
      include: {
        SkuCategories: true,
      },
    })

    // Create a map for quick SKU lookup - map both exact and normalized versions
    const skuMap = new Map<string, typeof skus[0]>()
    for (const sku of skus) {
      skuMap.set(sku.SkuID, sku)
      // If this SKU ID was a normalized version, also map the original order item SKU
      const originalOrderSku = skuNormalizationMap.get(sku.SkuID)
      if (originalOrderSku) {
        skuMap.set(originalOrderSku, sku)
      }
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
      orderStatus: order.OrderStatus || 'Pending',
    }

    // Build line items with SKU details
    const items = orderItems.map((item) => {
      const sku = skuMap.get(item.SKU || '')
      return {
        sku: item.SKU || 'Unknown SKU',
        quantity: item.Quantity || 0,
        price: item.Price || 0,
        currency: currency,
        lineTotal: (item.Quantity || 0) * (item.Price || 0),
        // Enhanced SKU details
        imageUrl: sku?.ShopifyImageURL || null,
        size: sku?.Size || '',
        description: sku?.OrderEntryDescription || sku?.Description || '',
        category: sku?.SkuCategories?.Name || '',
      }
    })

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

    // Generate PDF (portrait orientation)
    const pdfBuffer = await generatePdf(html, {
      format: 'Letter',
      landscape: false,
      margin: {
        top: '0.25in',
        right: '0.25in',
        bottom: '0.25in',
        left: '0.25in',
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
