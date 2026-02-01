/**
 * Order PDF Confirmation API
 *
 * GET /api/orders/[id]/pdf
 * Returns a NuORDER-style PDF order confirmation with:
 * - Ship-To/Bill-To addresses
 * - Inline product images
 * - Color, Size, Discount columns
 * - Payment Terms, Approval Date, Brand Notes
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePdf } from '@/lib/pdf/generate'
import { generateOrderConfirmationHtml } from '@/lib/pdf/order-confirmation'
import { parsePrice, resolveColor } from '@/lib/utils'
import { getCompanySettings } from '@/lib/data/queries/settings'
import { getImageDataUrl } from '@/lib/utils/pdf-images'

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

  if (isNaN(orderId) || orderId <= 0) {
    return NextResponse.json(
      { error: 'Invalid order ID' },
      { status: 400 }
    )
  }

  try {
    // Fetch company settings for PDF branding
    const companySettings = await getCompanySettings()

    // Fetch order with new fields
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
        Website: true,
        OrderStatus: true,
        CustomerID: true,
        // New PDF fields
        PaymentTerms: true,
        ApprovalDate: true,
        BrandNotes: true,
      },
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Fetch customer for addresses (if CustomerID exists)
    let customer = null
    if (order.CustomerID) {
      customer = await prisma.customers.findUnique({
        where: { ID: order.CustomerID },
        select: {
          StoreName: true,
          CustomerName: true,
          Email: true,
          Phone: true,
          // Bill-To address
          Street1: true,
          Street2: true,
          City: true,
          StateProvince: true,
          ZipPostal: true,
          Country: true,
          // Ship-To address
          ShippingStreet1: true,
          ShippingStreet2: true,
          ShippingCity: true,
          ShippingStateProvince: true,
          ShippingZipPostal: true,
          ShippingCountry: true,
        },
      })
    }

    // Fetch order items with LineDiscount
    // Phase 9: Added ID for shipment matching
    const orderItems = await prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
      select: {
        ID: true,  // Phase 9: Required for shipment matching
        SKU: true,
        Quantity: true,
        Price: true,
        PriceCurrency: true,
        LineDiscount: true,
      },
    })

    // Fetch SKU details for each order item (image, size, description, category, color, MSRP)
    const skuIds = orderItems.map((item) => item.SKU).filter(Boolean) as string[]

    // Build potential SKU IDs (handle prefix normalization)
    const potentialSkuIds = new Set<string>()
    const skuNormalizationMap = new Map<string, string>()

    for (const orderSkuId of skuIds) {
      potentialSkuIds.add(orderSkuId)
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
      select: {
        SkuID: true,
        Description: true,
        OrderEntryDescription: true,
        SkuColor: true,
        Size: true,
        ShopifyImageURL: true,
        ThumbnailPath: true,
        PriceCAD: true,
        PriceUSD: true,
        MSRPCAD: true,
        MSRPUSD: true,
        SkuCategories: {
          select: { Name: true },
        },
      },
    })

    // Create SKU lookup map
    const skuMap = new Map<string, (typeof skus)[0]>()
    for (const sku of skus) {
      skuMap.set(sku.SkuID, sku)
      const originalOrderSku = skuNormalizationMap.get(sku.SkuID)
      if (originalOrderSku) {
        skuMap.set(originalOrderSku, sku)
      }
    }

    // Determine currency from Country field (legacy behavior)
    const currency = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'

    // Build ship-to address
    const shipToAddress = customer?.ShippingStreet1
      ? {
          street1: customer.ShippingStreet1 || '',
          street2: customer.ShippingStreet2 || undefined,
          city: customer.ShippingCity || '',
          stateProvince: customer.ShippingStateProvince || '',
          zipPostal: customer.ShippingZipPostal || '',
          country: customer.ShippingCountry || '',
        }
      : null

    // Build bill-to address (check if same as shipping)
    let billToAddress: typeof shipToAddress | 'same' = null
    if (customer?.Street1) {
      const isSameAsShipping =
        customer.Street1 === customer.ShippingStreet1 &&
        customer.City === customer.ShippingCity &&
        customer.ZipPostal === customer.ShippingZipPostal

      if (isSameAsShipping) {
        billToAddress = 'same'
      } else {
        billToAddress = {
          street1: customer.Street1 || '',
          street2: customer.Street2 || undefined,
          city: customer.City || '',
          stateProvince: customer.StateProvince || '',
          zipPostal: customer.ZipPostal || '',
          country: customer.Country || '',
        }
      }
    }

    // Calculate totals
    let subtotal = 0
    let totalDiscount = 0

    // Build line items with SKU details (async for image fetching)
    const items = await Promise.all(
      orderItems.map(async (item) => {
        const sku = skuMap.get(item.SKU || '')
        const qty = item.Quantity || 0
        const price = item.Price || 0
        const discount = item.LineDiscount || 0
        const discountAmount = (price * qty * discount) / 100
        const lineTotal = price * qty - discountAmount

        subtotal += price * qty
        totalDiscount += discountAmount

        const description = sku?.OrderEntryDescription || sku?.Description || ''
        const skuId = item.SKU || ''

        // Detect prepack: SKU starts with "2PC-" means 2 pieces per SKU
        const unitsPerSku = skuId.toUpperCase().startsWith('2PC-') ? 2 : 1
        const unitPrice = unitsPerSku > 1 ? price / unitsPerSku : price

        // Get image as base64 data URL for PDF embedding
        // Fetches from S3 first, falls back to Shopify CDN
        const imageUrl = await getImageDataUrl(
          sku?.ThumbnailPath || null,
          sku?.ShopifyImageURL || null
        )

        return {
          sku: skuId || 'Unknown SKU',
          quantity: qty,
          price: price,
          currency: currency,
          lineTotal: lineTotal,
          discount: discount,
          // Enhanced SKU details
          imageUrl,
          size: sku?.Size || '',
          description: description,
          category: sku?.SkuCategories?.Name || '',
          color: resolveColor(sku?.SkuColor || null, skuId, description),
          retailPrice: currency === 'CAD'
            ? parsePrice(sku?.MSRPCAD)
            : parsePrice(sku?.MSRPUSD),
          // Prepack fields
          unitsPerSku,
          unitPrice,
        }
      })
    )

    // Phase 9: Fetch planned shipments for grouped PDF rendering
    interface PlannedShipmentForPdf {
      id: string
      collectionName: string | null
      plannedShipStart: Date
      plannedShipEnd: Date
      items: typeof items
      subtotal: number
    }
    let shipmentsForPdf: PlannedShipmentForPdf[] = []
    try {
      const plannedShipments = await prisma.plannedShipment.findMany({
        where: { CustomerOrderID: BigInt(orderId) },
        select: {
          ID: true,
          CollectionName: true,
          PlannedShipStart: true,
          PlannedShipEnd: true,
          Items: {
            select: { ID: true },
          },
        },
        orderBy: { PlannedShipStart: 'asc' },
      })

      // Build item-to-shipment mapping using IDs
      const itemShipmentMap = new Map<bigint, bigint>()
      for (const shipment of plannedShipments) {
        for (const item of shipment.Items) {
          itemShipmentMap.set(item.ID, shipment.ID)
        }
      }

      // Build a map from orderItem ID to built LineItem
      const orderItemToLineItem = new Map<bigint, typeof items[0]>()
      for (let i = 0; i < orderItems.length; i++) {
        const oi = orderItems[i]
        const li = items.find(item => item.sku === oi.SKU)
        if (li) {
          orderItemToLineItem.set(oi.ID, li)
        }
      }

      // Group LineItem objects by shipment
      shipmentsForPdf = plannedShipments.map((shipment) => {
        const shipmentItems: typeof items = []
        
        for (const shipmentItem of shipment.Items) {
          const lineItem = orderItemToLineItem.get(shipmentItem.ID)
          if (lineItem) {
            shipmentItems.push(lineItem)
          }
        }

        return {
          id: String(shipment.ID),
          collectionName: shipment.CollectionName,
          plannedShipStart: shipment.PlannedShipStart,
          plannedShipEnd: shipment.PlannedShipEnd,
          items: shipmentItems,
          subtotal: shipmentItems.reduce((sum, i) => sum + i.lineTotal, 0),
        }
      })
    } catch (err) {
      console.error('Failed to fetch planned shipments for PDF:', err)
      // Continue with empty array - will render flat format
    }

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
      // New address fields
      shipToAddress,
      billToAddress,
      // New PDF config fields
      paymentTerms: order.PaymentTerms || undefined,
      approvalDate: order.ApprovalDate || undefined,
      brandNotes: order.BrandNotes || undefined,
      // Calculated totals
      subtotal,
      totalDiscount,
    }

    // Generate HTML
    // Phase 9: Pass planned shipments for grouped rendering
    const html = generateOrderConfirmationHtml({
      order: orderData,
      items,
      plannedShipments: shipmentsForPdf.length > 0 ? shipmentsForPdf : undefined,
      company: {
        companyName: companySettings.CompanyName,
        logoUrl: companySettings.LogoUrl,
        phone: companySettings.Phone,
        email: companySettings.Email,
        website: companySettings.Website,
      },
    })

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

    // Return PDF response
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
