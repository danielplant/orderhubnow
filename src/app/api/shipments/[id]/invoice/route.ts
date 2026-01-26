/**
 * Shipping Invoice PDF API
 *
 * GET /api/shipments/[id]/invoice
 * Returns a customer-facing shipping invoice PDF for a shipment
 * 
 * First checks document storage for pre-generated PDF.
 * Falls back to on-demand generation if not stored.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePdf } from '@/lib/pdf/generate'
import { generateShippingInvoiceHtml } from '@/lib/pdf/shipping-invoice'
import { getDocument, getDocumentMetadata } from '@/lib/storage/document-storage'
import { getCompanySettings } from '@/lib/data/queries/settings'

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
      const storedDoc = await getDocument(id, 'shipping_invoice')
      if (storedDoc) {
        const metadata = await getDocumentMetadata(id, 'shipping_invoice')
        const filename = metadata?.fileName || `Invoice-${id}.pdf`
        
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
            BuyerName: true,
            SalesRep: true,
            OrderDate: true,
            ShipStartDate: true,
            ShipEndDate: true,
            CustomerPO: true,
            CustomerID: true,
            OrderAmount: true,
            Country: true,
            PaymentTerms: true,
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

    // Calculate previously invoiced amount (all shipments before this one)
    const previousShipments = await prisma.shipments.findMany({
      where: {
        CustomerOrderID: order.ID,
        ID: { lt: shipment.ID },
      },
      select: {
        ShippedTotal: true,
      },
    })
    const previouslyInvoiced = previousShipments.reduce(
      (sum: number, s: { ShippedTotal: number | null }) => sum + (s.ShippedTotal || 0),
      0
    )

    // Fetch customer for addresses
    let customer = null
    if (order.CustomerID) {
      customer = await prisma.customers.findUnique({
        where: { ID: order.CustomerID },
        select: {
          StoreName: true,
          Street1: true,
          Street2: true,
          City: true,
          StateProvince: true,
          ZipPostal: true,
          Country: true,
          ShippingStreet1: true,
          ShippingStreet2: true,
          ShippingCity: true,
          ShippingStateProvince: true,
          ShippingZipPostal: true,
          ShippingCountry: true,
        },
      })
    }

    // Build addresses
    const shipTo = {
      name: customer?.StoreName || order.StoreName || 'Unknown',
      street1: customer?.ShippingStreet1 || '',
      street2: customer?.ShippingStreet2 || undefined,
      city: customer?.ShippingCity || '',
      stateProvince: customer?.ShippingStateProvince || '',
      zipPostal: customer?.ShippingZipPostal || '',
      country: customer?.ShippingCountry || 'USA',
    }

    // Check if bill-to is same as ship-to
    const billToIsSame =
      customer?.Street1 === customer?.ShippingStreet1 &&
      customer?.City === customer?.ShippingCity &&
      customer?.ZipPostal === customer?.ShippingZipPostal

    const billTo = billToIsSame
      ? 'same' as const
      : {
          name: customer?.StoreName || order.StoreName || 'Unknown',
          street1: customer?.Street1 || '',
          street2: customer?.Street2 || undefined,
          city: customer?.City || '',
          stateProvince: customer?.StateProvince || '',
          zipPostal: customer?.ZipPostal || '',
          country: customer?.Country || 'USA',
        }

    // Fetch order items for this shipment
    const orderItemIds = shipment.ShipmentItems.map(
      (item: { OrderItemID: bigint | null }) => item.OrderItemID
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

    // Determine currency
    const currency = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'

    // Build items list with prices
    interface ShipmentItemType {
      OrderItemID: bigint | null
      QuantityShipped: number | null
      PriceOverride: number | null
    }
    const items = shipment.ShipmentItems.map((item: ShipmentItemType) => {
      const orderItem = orderItemMap.get(item.OrderItemID?.toString() || '')
      const sku = skuMap.get(orderItem?.SKU || '')
      const unitPrice = item.PriceOverride || orderItem?.Price || 0
      const quantity = item.QuantityShipped || 0

      return {
        sku: orderItem?.SKU || 'Unknown',
        productName: sku?.OrderEntryDescription || sku?.Description || orderItem?.SKU || 'Unknown Product',
        size: sku?.Size || '',
        color: sku?.SkuColor || undefined,
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
      }
    })

    // Calculate totals
    const subtotal = shipment.ShippedSubtotal || items.reduce((sum: number, item: { lineTotal: number }) => sum + item.lineTotal, 0)
    const shippingCost = shipment.ShippingCost || 0
    const invoiceTotal = shipment.ShippedTotal || subtotal + shippingCost
    const orderTotal = order.OrderAmount || 0
    const remainingBalance = orderTotal - previouslyInvoiced - invoiceTotal

    // Get tracking info
    const tracking = shipment.ShipmentTracking[0]

    // Generate invoice number (format: INV-OrderNumber-ShipmentNumber)
    const invoiceNumber = `INV-${order.OrderNumber}-${shipmentNumber}`

    // Calculate due date (Net 30 by default if payment terms not specified)
    const invoiceDate = shipment.ShipDate || new Date()
    let dueDate: Date | undefined
    if (order.PaymentTerms) {
      const netMatch = order.PaymentTerms.match(/Net\s*(\d+)/i)
      if (netMatch) {
        const days = parseInt(netMatch[1], 10)
        dueDate = new Date(invoiceDate)
        dueDate.setDate(dueDate.getDate() + days)
      }
    }

    // Fetch company settings for branding
    const companySettings = await getCompanySettings()
    const companyAddress = [
      companySettings.AddressLine1,
      companySettings.AddressLine2,
    ].filter(Boolean).join(', ')

    // Generate HTML
    const html = generateShippingInvoiceHtml({
      // Company info from database settings
      companyName: companySettings.CompanyName,
      companyAddress: companyAddress,
      companyPhone: companySettings.Phone || '',
      companyEmail: companySettings.Email || '',
      companyWebsite: companySettings.Website || '',
      companyLogoUrl: companySettings.LogoUrl || undefined,

      // Invoice info
      invoiceNumber,
      invoiceDate,
      dueDate,
      paymentTerms: order.PaymentTerms || undefined,

      // Order info
      orderNumber: order.OrderNumber || `#${order.ID}`,
      orderDate: order.OrderDate || new Date(),
      customerPO: order.CustomerPO || undefined,
      salesRep: order.SalesRep || 'N/A',

      // Shipment info
      shipmentNumber,
      totalShipments,
      shipDate: shipment.ShipDate || new Date(),
      carrier: tracking?.Carrier || undefined,
      trackingNumber: tracking?.TrackingNumber || undefined,

      // Addresses
      shipTo,
      billTo,

      // Items
      items,

      // Totals
      currency: currency as 'USD' | 'CAD',
      subtotal,
      shippingCost,
      invoiceTotal,

      // Order balance
      orderTotal,
      previouslyInvoiced,
      remainingBalance: Math.max(0, remainingBalance),
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

    const filename = `${invoiceNumber}.pdf`

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
    console.error('Shipping invoice PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
