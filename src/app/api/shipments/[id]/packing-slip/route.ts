/**
 * Packing Slip PDF API
 *
 * GET /api/shipments/[id]/packing-slip
 * Returns a warehouse-focused packing slip PDF for a shipment
 * 
 * First checks document storage for pre-generated PDF.
 * Falls back to on-demand generation if not stored.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePdf } from '@/lib/pdf/generate'
import { generatePackingSlipHtml } from '@/lib/pdf/packing-slip'
import { extractSize } from '@/lib/utils/size-sort'
import { getDocument, getDocumentMetadata } from '@/lib/storage/document-storage'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { id } = await context.params
  const debugMode = request.nextUrl.searchParams.get('debug')
  const forceRegenerate = request.nextUrl.searchParams.get('regenerate') === 'true'

  const shipmentId = parseInt(id, 10)

  if (isNaN(shipmentId) || shipmentId <= 0) {
    return NextResponse.json({ error: 'Invalid shipment ID' }, { status: 400 })
  }

  try {
    // Check for stored document first (unless debug or regenerate mode)
    if (!debugMode && !forceRegenerate) {
      const storedDoc = await getDocument(id, 'packing_slip')
      if (storedDoc) {
        const metadata = await getDocumentMetadata(id, 'packing_slip')
        const filename = metadata?.fileName || `PackingSlip-${id}.pdf`
        
        return new NextResponse(new Uint8Array(storedDoc), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': storedDoc.length.toString(),
          },
        })
      }
    }
    // Fetch shipment with related data
    const shipment = await prisma.shipments.findUnique({
      where: { ID: BigInt(shipmentId) },
      include: {
        ShipmentItems: true,
        ShipmentTracking: true,
        CustomerOrders: {
          select: {
            ID: true,
            OrderNumber: true,
            StoreName: true,
            OrderDate: true,
            ShipStartDate: true,
            ShipEndDate: true,
            CustomerPO: true,
            CustomerID: true,
          },
        },
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    const order = shipment.CustomerOrders

    // Count total shipments for this order
    const totalShipments = await prisma.shipments.count({
      where: { CustomerOrderID: order.ID },
    })

    // Get shipment number (order by ID)
    const shipmentsBeforeThis = await prisma.shipments.count({
      where: {
        CustomerOrderID: order.ID,
        ID: { lt: shipment.ID },
      },
    })
    const shipmentNumber = shipmentsBeforeThis + 1

    // Fetch customer for shipping address
    let customer = null
    if (order.CustomerID) {
      customer = await prisma.customers.findUnique({
        where: { ID: order.CustomerID },
        select: {
          StoreName: true,
          ShippingStreet1: true,
          ShippingStreet2: true,
          ShippingCity: true,
          ShippingStateProvince: true,
          ShippingZipPostal: true,
          ShippingCountry: true,
        },
      })
    }

    // Build ship-to address
    const shipTo = {
      name: customer?.StoreName || order.StoreName || 'Unknown',
      street1: customer?.ShippingStreet1 || '',
      street2: customer?.ShippingStreet2 || undefined,
      city: customer?.ShippingCity || '',
      stateProvince: customer?.ShippingStateProvince || '',
      zipPostal: customer?.ShippingZipPostal || '',
      country: customer?.ShippingCountry || 'USA',
    }

    // Fetch SKU details for each shipment item
    const orderItemIds = shipment.ShipmentItems.map(
      (item) => item.OrderItemID
    ).filter(Boolean) as bigint[]

    const orderItems = await prisma.customerOrdersItems.findMany({
      where: { ID: { in: orderItemIds } },
      select: {
        ID: true,
        SKU: true,
        Price: true,
      },
    })

    const orderItemMap = new Map(orderItems.map((item) => [item.ID.toString(), item]))

    // Fetch SKU details
    const skuIds = orderItems.map((item) => item.SKU).filter(Boolean) as string[]
    const skus = await prisma.sku.findMany({
      where: { SkuID: { in: skuIds } },
      select: {
        SkuID: true,
        Description: true,
        OrderEntryDescription: true,
        SkuColor: true,
        Size: true,
      },
    })

    const skuMap = new Map(skus.map((sku) => [sku.SkuID, sku]))

    // Build items list
    const items = shipment.ShipmentItems.map((item: { OrderItemID: bigint | null; QuantityShipped: number | null }) => {
      const orderItem = orderItemMap.get(item.OrderItemID?.toString() || '')
      const sku = skuMap.get(orderItem?.SKU || '')

      return {
        sku: orderItem?.SKU || 'Unknown',
        productName: sku?.OrderEntryDescription || sku?.Description || orderItem?.SKU || 'Unknown Product',
        size: extractSize(sku?.Size || ''),
        color: sku?.SkuColor || undefined,
        quantity: item.QuantityShipped || 0,
      }
    })

    // Get tracking info
    const tracking = shipment.ShipmentTracking[0]

    // Calculate totals
    const totalItems = items.length
    const totalUnits = items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0)

    // Generate HTML
    const html = generatePackingSlipHtml({
      orderNumber: order.OrderNumber || `#${order.ID}`,
      orderDate: order.OrderDate || new Date(),
      shipWindowStart: order.ShipStartDate || new Date(),
      shipWindowEnd: order.ShipEndDate || new Date(),
      customerPO: order.CustomerPO || undefined,
      shipmentNumber,
      totalShipments,
      shipDate: shipment.ShipDate || new Date(),
      carrier: tracking?.Carrier || undefined,
      trackingNumber: tracking?.TrackingNumber || undefined,
      shipTo,
      items,
      totalItems,
      totalUnits,
    })

    // DEBUG MODE: Return raw HTML instead of PDF
    if (debugMode === 'html') {
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // Generate PDF
    const pdfBuffer = await generatePdf(html, {
      format: 'Letter',
      landscape: false,
      margin: {
        top: '0.4in',
        right: '0.4in',
        bottom: '0.4in',
        left: '0.4in',
      },
    })

    const filename = `${order.OrderNumber || order.ID}-PackingSlip-${shipmentNumber}.pdf`

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
    console.error('Packing slip PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
