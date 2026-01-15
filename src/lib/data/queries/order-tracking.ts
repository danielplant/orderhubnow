/**
 * Order Tracking Queries
 * 
 * Public-safe queries for order tracking page.
 * Returns only information appropriate for customers to see.
 */

import { prisma } from '@/lib/prisma'
import { getTrackingUrl as getCarrierTrackingUrl } from '@/lib/types/shipment'
import type { Carrier } from '@/lib/types/shipment'

export interface PublicShipmentItem {
  sku: string
  productName: string
  quantity: number
}

export interface PublicShipment {
  shipmentNumber: number
  shipDate: Date | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  items: PublicShipmentItem[]
}

export interface PublicOrderTracking {
  orderNumber: string
  storeName: string
  orderDate: Date
  status: string
  itemsOrdered: number
  itemsShipped: number
  itemsCancelled: number
  totalShipments: number
  shipments: PublicShipment[]
}

/**
 * Get public order tracking data
 * Returns null if order not found or email doesn't match
 */
export async function getPublicOrderTracking(
  orderId: string,
  email: string
): Promise<PublicOrderTracking | null> {
  const order = await prisma.customerOrders.findUnique({
    where: { ID: BigInt(orderId) },
    select: {
      ID: true,
      OrderNumber: true,
      StoreName: true,
      CustomerEmail: true,
      OrderDate: true,
      OrderStatus: true,
      CustomerOrdersItems: {
        select: {
          ID: true,
          SKU: true,
          Quantity: true,
          CancelledQty: true,
        },
      },
      Shipments: {
        orderBy: { CreatedAt: 'asc' },
        select: {
          ID: true,
          ShipDate: true,
          ShipmentItems: {
            select: {
              QuantityShipped: true,
              OrderItem: {
                select: {
                  SKU: true,
                },
              },
            },
          },
          ShipmentTracking: {
            select: {
              Carrier: true,
              TrackingNumber: true,
            },
          },
        },
      },
    },
  })

  if (!order) return null

  // Verify email matches (case-insensitive)
  if (order.CustomerEmail?.toLowerCase() !== email.toLowerCase()) {
    return null
  }

  // Calculate totals
  const itemsOrdered = order.CustomerOrdersItems.reduce((sum, item) => sum + item.Quantity, 0)
  const itemsCancelled = order.CustomerOrdersItems.reduce((sum, item) => sum + (item.CancelledQty || 0), 0)
  
  // Get all shipped quantities
  const shippedByItem = new Map<string, number>()
  for (const shipment of order.Shipments) {
    for (const item of shipment.ShipmentItems) {
      const key = item.OrderItem?.SKU || ''
      shippedByItem.set(key, (shippedByItem.get(key) || 0) + item.QuantityShipped)
    }
  }
  const itemsShipped = Array.from(shippedByItem.values()).reduce((sum, qty) => sum + qty, 0)

  // Get SKU details for product names
  const allSkus = new Set<string>()
  for (const shipment of order.Shipments) {
    for (const item of shipment.ShipmentItems) {
      if (item.OrderItem?.SKU) allSkus.add(item.OrderItem.SKU)
    }
  }

  const skuDetails = await prisma.sku.findMany({
    where: { SkuID: { in: Array.from(allSkus) } },
    select: { SkuID: true, OrderEntryDescription: true, Description: true },
  })
  const skuMap = new Map(skuDetails.map((s) => [s.SkuID, s]))

  // Build shipments array
  const shipments: PublicShipment[] = order.Shipments.map((shipment, index) => {
    const tracking = shipment.ShipmentTracking[0]
    const trackingUrl = tracking
      ? getCarrierTrackingUrl(tracking.Carrier as Carrier, tracking.TrackingNumber) || null
      : null

    // Aggregate items by SKU
    const itemsBySku = new Map<string, number>()
    for (const item of shipment.ShipmentItems) {
      const sku = item.OrderItem?.SKU || 'Unknown'
      itemsBySku.set(sku, (itemsBySku.get(sku) || 0) + item.QuantityShipped)
    }

    const items: PublicShipmentItem[] = Array.from(itemsBySku.entries()).map(([sku, quantity]) => {
      const skuInfo = skuMap.get(sku)
      return {
        sku,
        productName: skuInfo?.OrderEntryDescription || skuInfo?.Description || sku,
        quantity,
      }
    })

    return {
      shipmentNumber: index + 1,
      shipDate: shipment.ShipDate,
      carrier: tracking?.Carrier || null,
      trackingNumber: tracking?.TrackingNumber || null,
      trackingUrl,
      items,
    }
  })

  return {
    orderNumber: order.OrderNumber,
    storeName: order.StoreName,
    orderDate: order.OrderDate,
    status: order.OrderStatus,
    itemsOrdered,
    itemsShipped,
    itemsCancelled,
    totalShipments: order.Shipments.length,
    shipments,
  }
}

/**
 * Get order by order number and email (for lookup form)
 */
export async function findOrderByNumberAndEmail(
  orderNumber: string,
  email: string
): Promise<{ orderId: string } | null> {
  // SQL Server doesn't support case-insensitive in Prisma the same way
  // So we fetch and compare manually
  const orders = await prisma.customerOrders.findMany({
    where: {
      OrderNumber: orderNumber,
    },
    select: {
      ID: true,
      CustomerEmail: true,
    },
  })

  const order = orders.find(
    (o) => o.CustomerEmail?.toLowerCase() === email.toLowerCase()
  )

  return order ? { orderId: order.ID.toString() } : null
}
