'use server'

/**
 * Fulfillment Back-Sync: Pull tracking + shipped items FROM Shopify INTO OHN.
 * 
 * This module handles syncing fulfillment data from Shopify orders that were
 * transferred from OHN. It creates Shipments, ShipmentItems, and ShipmentTracking
 * records based on Shopify fulfillments.
 */

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { shopify, type ShopifyFulfillmentDetails } from '@/lib/shopify/client'
import type { Carrier } from '@/lib/types/shipment'

// ============================================================================
// Types
// ============================================================================

export interface FulfillmentSyncResult {
  success: boolean
  orderId: string
  orderNumber?: string
  shipmentsCreated: number
  shipmentsSkipped: number
  error?: string
}

export interface BulkFulfillmentSyncResult {
  success: boolean
  ordersProcessed: number
  shipmentsCreated: number
  errors: Array<{ orderId: string; error: string }>
}

interface OrderItemForMapping {
  ID: bigint
  SKU: string
  SKUVariantID: bigint
  ShopifyLineItemID: string | null
  Quantity: number
  Price: number
}

// ============================================================================
// Single Order Sync
// ============================================================================

/**
 * Sync fulfillments from Shopify for a single order.
 * Creates Shipments, ShipmentItems, and ShipmentTracking records.
 */
export async function syncFulfillmentsFromShopify(
  orderId: string
): Promise<FulfillmentSyncResult> {
  try {
    // Check if Shopify is configured
    if (!shopify.isConfigured()) {
      return {
        success: false,
        orderId,
        shipmentsCreated: 0,
        shipmentsSkipped: 0,
        error: 'Shopify is not configured',
      }
    }

    // Get order from database
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        OrderNumber: true,
        ShopifyOrderID: true,
        IsTransferredToShopify: true,
        OrderStatus: true,
        CustomerOrdersItems: {
          select: {
            ID: true,
            SKU: true,
            SKUVariantID: true,
            ShopifyLineItemID: true,
            Quantity: true,
            Price: true,
            CancelledQty: true,
          },
        },
        Shipments: {
          select: {
            ShopifyFulfillmentID: true,
          },
        },
      },
    })

    if (!order) {
      return {
        success: false,
        orderId,
        shipmentsCreated: 0,
        shipmentsSkipped: 0,
        error: 'Order not found',
      }
    }

    if (!order.IsTransferredToShopify || !order.ShopifyOrderID) {
      return {
        success: false,
        orderId,
        orderNumber: order.OrderNumber,
        shipmentsCreated: 0,
        shipmentsSkipped: 0,
        error: 'Order has not been transferred to Shopify',
      }
    }

    // Fetch fulfillments from Shopify
    const { fulfillments, error: fetchError } = await shopify.fulfillments.list(
      order.ShopifyOrderID
    )

    if (fetchError) {
      return {
        success: false,
        orderId,
        orderNumber: order.OrderNumber,
        shipmentsCreated: 0,
        shipmentsSkipped: 0,
        error: `Failed to fetch fulfillments: ${fetchError}`,
      }
    }

    if (!fulfillments || fulfillments.length === 0) {
      return {
        success: true,
        orderId,
        orderNumber: order.OrderNumber,
        shipmentsCreated: 0,
        shipmentsSkipped: 0,
      }
    }

    // Get existing fulfillment IDs to avoid duplicates
    const existingFulfillmentIds = new Set(
      order.Shipments
        .filter((s) => s.ShopifyFulfillmentID)
        .map((s) => s.ShopifyFulfillmentID)
    )

    let shipmentsCreated = 0
    let shipmentsSkipped = 0

    for (const fulfillment of fulfillments) {
      // Skip if already synced
      if (existingFulfillmentIds.has(String(fulfillment.id))) {
        shipmentsSkipped++
        continue
      }

      // Skip if no line items
      if (!fulfillment.line_items || fulfillment.line_items.length === 0) {
        shipmentsSkipped++
        continue
      }

      // Map fulfillment line items to order items
      const mappedItems = mapFulfillmentLineItems(
        fulfillment.line_items,
        order.CustomerOrdersItems as OrderItemForMapping[]
      )

      if (mappedItems.length === 0) {
        shipmentsSkipped++
        continue
      }

      // Calculate shipped subtotal
      const shippedSubtotal = mappedItems.reduce((sum, item) => {
        const orderItem = order.CustomerOrdersItems.find(
          (oi) => String(oi.ID) === item.orderItemId
        )
        return sum + (orderItem?.Price ?? 0) * item.quantityShipped
      }, 0)

      // Create shipment in transaction
      await prisma.$transaction(async (tx) => {
        // Create shipment header
        const shipment = await tx.shipments.create({
          data: {
            CustomerOrderID: order.ID,
            ShopifyFulfillmentID: String(fulfillment.id),
            ShippedSubtotal: shippedSubtotal,
            ShippingCost: 0, // Shopify doesn't provide this per-fulfillment
            ShippedTotal: shippedSubtotal,
            ShipDate: fulfillment.created_at ? new Date(fulfillment.created_at) : new Date(),
            InternalNotes: 'Synced from Shopify',
            CreatedBy: 'Shopify Sync',
            CreatedAt: new Date(),
          },
        })

        // Create shipment items
        await tx.shipmentItems.createMany({
          data: mappedItems.map((item) => ({
            ShipmentID: shipment.ID,
            OrderItemID: BigInt(item.orderItemId),
            QuantityShipped: item.quantityShipped,
          })),
        })

        // Create tracking records (Shopify can have multiple tracking numbers)
        const trackingNumbers = fulfillment.tracking_numbers?.length
          ? fulfillment.tracking_numbers
          : fulfillment.tracking_number
            ? [fulfillment.tracking_number]
            : []

        if (trackingNumbers.length > 0) {
          const carrier = mapShopifyCarrier(fulfillment.tracking_company)
          await tx.shipmentTracking.createMany({
            data: trackingNumbers.map((trackingNumber) => ({
              ShipmentID: shipment.ID,
              Carrier: carrier,
              TrackingNumber: trackingNumber,
              AddedAt: new Date(),
            })),
          })
        }

      })

      // Update line item statuses OUTSIDE transaction to avoid timeout
      // We know what we just shipped from mappedItems
      for (const item of mappedItems) {
        const orderItem = order.CustomerOrdersItems.find(
          (oi) => String(oi.ID) === item.orderItemId
        )
        if (orderItem) {
          // Get total shipped for this item (all shipments)
          const allShipmentItems = await prisma.shipmentItems.findMany({
            where: { OrderItemID: BigInt(item.orderItemId) },
            select: { QuantityShipped: true },
          })
          const totalShipped = allShipmentItems.reduce(
            (sum, si) => sum + si.QuantityShipped,
            0
          )
          const remaining =
            orderItem.Quantity - totalShipped - (orderItem.CancelledQty ?? 0)

          await prisma.customerOrdersItems.update({
            where: { ID: BigInt(item.orderItemId) },
            data: {
              Status: remaining <= 0 ? 'Shipped' : 'Open',
            },
          })
        }
      }

      shipmentsCreated++
    }

    // Update order status if needed
    await updateOrderStatusAfterSync(orderId)

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)

    return {
      success: true,
      orderId,
      orderNumber: order.OrderNumber,
      shipmentsCreated,
      shipmentsSkipped,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to sync fulfillments'
    return {
      success: false,
      orderId,
      shipmentsCreated: 0,
      shipmentsSkipped: 0,
      error: message,
    }
  }
}

// ============================================================================
// Bulk Sync
// ============================================================================

/**
 * Sync fulfillments for all transferred orders that may have new fulfillments.
 * Used by cron job for automated polling.
 */
export async function syncAllPendingFulfillments(options?: {
  /** Only sync orders transferred within last N days (default: 90) */
  transferredWithinDays?: number
  /** Max orders to sync per run (default: 50) */
  limit?: number
}): Promise<BulkFulfillmentSyncResult> {
  const transferredWithinDays = options?.transferredWithinDays ?? 90
  const limit = options?.limit ?? 50

  const oldestOrderDate = new Date()
  oldestOrderDate.setDate(oldestOrderDate.getDate() - transferredWithinDays)

  try {
    // Find orders that:
    // 1. Have been transferred to Shopify
    // 2. Are within the date range
    // 3. Are not fully shipped in OHN yet (OrderStatus !== 'Shipped' && !== 'Invoiced')
    const ordersToSync = await prisma.customerOrders.findMany({
      where: {
        IsTransferredToShopify: true,
        ShopifyOrderID: { not: null },
        OrderDate: { gte: oldestOrderDate },
        OrderStatus: { notIn: ['Shipped', 'Invoiced', 'Cancelled'] },
      },
      select: {
        ID: true,
        OrderNumber: true,
      },
      take: limit,
      orderBy: { OrderDate: 'desc' },
    })

    if (ordersToSync.length === 0) {
      return {
        success: true,
        ordersProcessed: 0,
        shipmentsCreated: 0,
        errors: [],
      }
    }

    let ordersProcessed = 0
    let totalShipmentsCreated = 0
    const errors: Array<{ orderId: string; error: string }> = []

    for (const order of ordersToSync) {
      const result = await syncFulfillmentsFromShopify(String(order.ID))

      ordersProcessed++
      totalShipmentsCreated += result.shipmentsCreated

      if (!result.success && result.error) {
        errors.push({ orderId: String(order.ID), error: result.error })
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    return {
      success: true,
      ordersProcessed,
      shipmentsCreated: totalShipmentsCreated,
      errors,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to sync fulfillments'
    return {
      success: false,
      ordersProcessed: 0,
      shipmentsCreated: 0,
      errors: [{ orderId: 'bulk', error: message }],
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map Shopify fulfillment line items to OHN order items.
 * Primary: Match by ShopifyLineItemID
 * Fallback: Match by variant_id → SKUVariantID
 */
function mapFulfillmentLineItems(
  fulfillmentLineItems: ShopifyFulfillmentDetails['line_items'],
  orderItems: OrderItemForMapping[]
): Array<{ orderItemId: string; quantityShipped: number }> {
  const result: Array<{ orderItemId: string; quantityShipped: number }> = []
  const matchedIds = new Set<string>()

  for (const fli of fulfillmentLineItems) {
    // Primary: match by ShopifyLineItemID
    let match = orderItems.find(
      (oi) =>
        oi.ShopifyLineItemID === String(fli.id) && !matchedIds.has(String(oi.ID))
    )

    // Fallback: match by variant_id
    if (!match) {
      match = orderItems.find(
        (oi) =>
          Number(oi.SKUVariantID) === fli.variant_id &&
          !matchedIds.has(String(oi.ID))
      )
    }

    if (match) {
      result.push({
        orderItemId: String(match.ID),
        quantityShipped: fli.quantity,
      })
      matchedIds.add(String(match.ID))
    }
  }

  return result
}

/**
 * Map Shopify tracking company to OHN Carrier type.
 */
function mapShopifyCarrier(trackingCompany: string | null): Carrier {
  if (!trackingCompany) return 'Other'

  const normalized = trackingCompany.toLowerCase()

  if (normalized.includes('ups')) return 'UPS'
  if (normalized.includes('fedex') || normalized.includes('fed ex')) return 'FedEx'
  if (normalized.includes('usps') || normalized.includes('postal')) return 'USPS'
  if (normalized.includes('dhl')) return 'DHL'

  return 'Other'
}

/**
 * Update order status after fulfillment sync.
 * Sets to 'Partially Shipped' or 'Shipped' based on fulfillment state.
 */
async function updateOrderStatusAfterSync(orderId: string): Promise<void> {
  const order = await prisma.customerOrders.findUnique({
    where: { ID: BigInt(orderId) },
    select: {
      ID: true,
      OrderStatus: true,
      CustomerOrdersItems: {
        select: {
          ID: true,
          Quantity: true,
          CancelledQty: true,
        },
      },
    },
  })

  if (!order) return

  // Don't update if already in a terminal status
  if (['Invoiced', 'Cancelled'].includes(order.OrderStatus)) {
    return
  }

  // Query ShipmentItems directly (more reliable than nested include)
  const shipmentItems = await prisma.shipmentItems.findMany({
    where: {
      Shipment: {
        CustomerOrderID: BigInt(orderId),
        VoidedAt: null,
      },
    },
    select: {
      OrderItemID: true,
      QuantityShipped: true,
    },
  })

  // Calculate total shipped per item
  const shippedByItem = new Map<string, number>()
  for (const si of shipmentItems) {
    const key = String(si.OrderItemID)
    shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + si.QuantityShipped)
  }

  // Check if fully shipped
  const hasShipments = shippedByItem.size > 0
  let fullyShipped = true

  for (const item of order.CustomerOrdersItems) {
    const shipped = shippedByItem.get(String(item.ID)) ?? 0
    const required = item.Quantity - (item.CancelledQty ?? 0)

    if (shipped < required) {
      fullyShipped = false
      break // No need to continue checking
    }
  }

  // Update status
  let newStatus = order.OrderStatus

  if (fullyShipped && hasShipments) {
    newStatus = 'Shipped'
  } else if (hasShipments) {
    newStatus = 'Partially Shipped'
  }

  if (newStatus !== order.OrderStatus) {
    await prisma.customerOrders.update({
      where: { ID: order.ID },
      data: {
        OrderStatus: newStatus,
        IsShipped: newStatus === 'Shipped',
      },
    })
  }
}
