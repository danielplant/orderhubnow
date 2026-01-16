/**
 * Shipment Document Generation Service
 * 
 * Generates and stores both packing slip and invoice PDFs when a shipment is created.
 */

import { prisma } from '@/lib/prisma'
import { generatePdf } from '@/lib/pdf/generate'
import { generatePackingSlipHtml } from '@/lib/pdf/packing-slip'
import { generateShippingInvoiceHtml } from '@/lib/pdf/shipping-invoice'
import { storeDocument, type DocumentMetadata } from '@/lib/storage/document-storage'
import { extractSize } from '@/lib/utils/size-sort'
import { getCompanySettings } from '@/lib/data/queries/settings'

interface GenerateDocumentsInput {
  shipmentId: string
  generatedBy?: string
}

interface GenerateDocumentsResult {
  packingSlip: {
    documentNumber: string
    fileSize: number
  }
  invoice: {
    documentNumber: string
    fileSize: number
  }
}

/**
 * Generate and store both packing slip and invoice for a shipment
 */
export async function generateShipmentDocuments(
  input: GenerateDocumentsInput
): Promise<GenerateDocumentsResult> {
  const { shipmentId, generatedBy } = input

  // Fetch company settings for PDF branding
  const companySettings = await getCompanySettings()

  // Fetch shipment with all related data
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
          CustomerPhone: true,
          CustomerEmail: true,
        },
      },
    },
  })

  if (!shipment) {
    throw new Error(`Shipment ${shipmentId} not found`)
  }

  const order = shipment.CustomerOrders
  const orderId = order.ID.toString()
  const orderNumber = order.OrderNumber || `#${orderId}`

  // Count total shipments for this order and get shipment number
  const [totalShipments, shipmentsBeforeThis] = await Promise.all([
    prisma.shipments.count({
      where: { CustomerOrderID: order.ID },
    }),
    prisma.shipments.count({
      where: {
        CustomerOrderID: order.ID,
        ID: { lt: shipment.ID },
      },
    }),
  ])
  const shipmentNumber = shipmentsBeforeThis + 1

  // Fetch customer for addresses
  let customer = null
  if (order.CustomerID) {
    customer = await prisma.customers.findUnique({
      where: { ID: order.CustomerID },
      select: {
        StoreName: true,
        // Main address (billing)
        Street1: true,
        Street2: true,
        City: true,
        StateProvince: true,
        ZipPostal: true,
        Country: true,
        // Shipping address
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
    street1: customer?.ShippingStreet1 || customer?.Street1 || '',
    street2: customer?.ShippingStreet2 || customer?.Street2 || undefined,
    city: customer?.ShippingCity || customer?.City || '',
    stateProvince: customer?.ShippingStateProvince || customer?.StateProvince || '',
    zipPostal: customer?.ShippingZipPostal || customer?.ZipPostal || '',
    country: customer?.ShippingCountry || customer?.Country || order.Country || 'USA',
  }

  // Billing address - use main address if no separate shipping address
  const billTo = {
    name: order.BuyerName || order.StoreName || 'Unknown',
    street1: customer?.Street1 || customer?.ShippingStreet1 || '',
    street2: customer?.Street2 || customer?.ShippingStreet2 || undefined,
    city: customer?.City || customer?.ShippingCity || '',
    stateProvince: customer?.StateProvince || customer?.ShippingStateProvince || '',
    zipPostal: customer?.ZipPostal || customer?.ShippingZipPostal || '',
    country: customer?.Country || customer?.ShippingCountry || order.Country || 'USA',
  }

  // Fetch order items and SKU details
  const orderItemIds = shipment.ShipmentItems.map((item) => item.OrderItemID).filter(Boolean) as bigint[]

  const orderItems = await prisma.customerOrdersItems.findMany({
    where: { ID: { in: orderItemIds } },
    select: {
      ID: true,
      SKU: true,
      Price: true,
      PriceCurrency: true,
    },
  })

  const orderItemMap = new Map(orderItems.map((item) => [item.ID.toString(), item]))

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
  const currency: 'USD' | 'CAD' = orderItems[0]?.PriceCurrency === 'CAD' ? 'CAD' : 'USD'

  // Build items for packing slip (no prices)
  const packingSlipItems = shipment.ShipmentItems.map((item) => {
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

  // Build items for invoice (with prices)
  const invoiceItems = shipment.ShipmentItems.map((item) => {
    const orderItem = orderItemMap.get(item.OrderItemID?.toString() || '')
    const sku = skuMap.get(orderItem?.SKU || '')
    const price = item.PriceOverride ?? orderItem?.Price ?? 0

    return {
      sku: orderItem?.SKU || 'Unknown',
      productName: sku?.OrderEntryDescription || sku?.Description || orderItem?.SKU || 'Unknown Product',
      size: extractSize(sku?.Size || ''),
      quantity: item.QuantityShipped || 0,
      unitPrice: price,
      lineTotal: price * (item.QuantityShipped || 0),
    }
  })

  // Get tracking info
  const tracking = shipment.ShipmentTracking[0]

  // Calculate totals
  const totalItems = packingSlipItems.length
  const totalUnits = packingSlipItems.reduce((sum, item) => sum + item.quantity, 0)

  // Calculate previously shipped amounts for invoice
  const previousShipments = await prisma.shipments.findMany({
    where: {
      CustomerOrderID: order.ID,
      ID: { lt: shipment.ID },
    },
    select: {
      ShippedTotal: true,
    },
  })
  const previouslyInvoiced = previousShipments.reduce((sum, s) => sum + (s.ShippedTotal || 0), 0)

  // Document metadata
  const baseMetadata: Omit<DocumentMetadata, 'documentType'> = {
    shipmentId,
    orderId,
    orderNumber,
    shipmentNumber,
    generatedBy,
  }

  // Generate and store packing slip
  const packingSlipHtml = generatePackingSlipHtml({
    orderNumber,
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
    items: packingSlipItems,
    totalItems,
    totalUnits,
  })

  const packingSlipPdf = await generatePdf(packingSlipHtml, {
    format: 'Letter',
    landscape: false,
    margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
  })

  const packingSlipDoc = await storeDocument(Buffer.from(packingSlipPdf), {
    ...baseMetadata,
    documentType: 'packing_slip',
  })

  // Calculate invoice totals
  const subtotal = shipment.ShippedSubtotal || 0
  const shippingCost = shipment.ShippingCost || 0
  const invoiceTotal = shipment.ShippedTotal || subtotal + shippingCost
  const orderTotal = order.OrderAmount || 0
  const remainingBalance = Math.max(0, orderTotal - previouslyInvoiced - invoiceTotal)

  // Generate invoice number
  const invoiceNumber = `INV-${orderNumber}-${shipmentNumber}`
  const invoiceDate = shipment.ShipDate || new Date()

  // Build company address from settings
  const companyAddress = [
    companySettings.AddressLine1,
    companySettings.AddressLine2,
  ].filter(Boolean).join(', ')

  // Generate and store invoice
  const invoiceHtml = generateShippingInvoiceHtml({
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

    // Order info
    orderNumber,
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
    items: invoiceItems,

    // Totals
    currency,
    subtotal,
    shippingCost,
    invoiceTotal,

    // Order balance
    orderTotal,
    previouslyInvoiced,
    remainingBalance,
  })

  const invoicePdf = await generatePdf(invoiceHtml, {
    format: 'Letter',
    landscape: false,
    margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
  })

  const invoiceDoc = await storeDocument(Buffer.from(invoicePdf), {
    ...baseMetadata,
    documentType: 'shipping_invoice',
  })

  return {
    packingSlip: {
      documentNumber: packingSlipDoc.documentNumber,
      fileSize: packingSlipDoc.fileSize,
    },
    invoice: {
      documentNumber: invoiceDoc.documentNumber,
      fileSize: invoiceDoc.fileSize,
    },
  }
}
