'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import { shopify } from '@/lib/shopify/client'
import type {
  CreateShipmentInput,
  UpdateShipmentInput,
  TrackingInput,
  ShipmentRow,
  ShipmentItemRow,
  TrackingRecord,
  OrderShipmentSummary,
  OrderItemWithFulfillment,
} from '@/lib/types/shipment'
import { getTrackingUrl } from '@/lib/types/shipment'
import { findShopifyVariant } from '@/lib/data/queries/shopify'

// ============================================================================
// Auth Helper
// ============================================================================

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  return session
}

// ============================================================================
// Create Shipment
// ============================================================================

export interface CreateShipmentResult {
  success: boolean
  shipmentId?: string
  shopifyFulfillmentId?: string | null
  error?: string
}

/**
 * Create a new shipment for an order.
 * - Creates Shipment header with items and optional tracking
 * - Calculates ShippedSubtotal from line items
 * - Auto-updates order status if fully shipped
 */
export async function createShipment(
  input: CreateShipmentInput
): Promise<CreateShipmentResult> {
  try {
    const session = await requireAdmin()
    const userName = session.user.name || session.user.loginId

    // Validate order exists
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(input.orderId) },
      select: {
        ID: true,
        OrderNumber: true,
        OrderStatus: true,
        IsTransferredToShopify: true,
        ShopifyOrderID: true,
        CustomerOrdersItems: {
          select: {
            ID: true,
            SKU: true,
            Quantity: true,
            Price: true,
          },
        },
      },
    })

    if (!order) {
      return { success: false, error: 'Order not found' }
    }

    // Validate items exist and quantities are valid
    const orderItemMap = new Map(
      order.CustomerOrdersItems.map((item) => [item.ID.toString(), item])
    )

    for (const item of input.items) {
      const orderItem = orderItemMap.get(item.orderItemId)
      if (!orderItem) {
        return {
          success: false,
          error: `Order item ${item.orderItemId} not found`,
        }
      }
      if (item.quantityShipped <= 0) {
        return {
          success: false,
          error: `Invalid quantity for item ${orderItem.SKU}`,
        }
      }
    }

    // Calculate shipped subtotal
    let shippedSubtotal = 0
    for (const item of input.items) {
      const orderItem = orderItemMap.get(item.orderItemId)!
      const unitPrice = item.priceOverride ?? orderItem.Price
      shippedSubtotal += unitPrice * item.quantityShipped
    }

    const shippedTotal = shippedSubtotal + input.shippingCost

    // Create shipment in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create shipment header
      const shipment = await tx.shipments.create({
        data: {
          CustomerOrderID: BigInt(input.orderId),
          ShippedSubtotal: shippedSubtotal,
          ShippingCost: input.shippingCost,
          ShippedTotal: shippedTotal,
          ShipDate: input.shipDate ? new Date(input.shipDate) : new Date(),
          InternalNotes: input.notes ?? null,
          CreatedBy: userName,
          CreatedAt: new Date(),
        },
      })

      // Create shipment items
      await tx.shipmentItems.createMany({
        data: input.items.map((item) => ({
          ShipmentID: shipment.ID,
          OrderItemID: BigInt(item.orderItemId),
          QuantityShipped: item.quantityShipped,
          PriceOverride: item.priceOverride ?? null,
        })),
      })

      // Create tracking if provided
      if (input.tracking) {
        await tx.shipmentTracking.create({
          data: {
            ShipmentID: shipment.ID,
            Carrier: input.tracking.carrier,
            TrackingNumber: input.tracking.trackingNumber,
            AddedAt: new Date(),
          },
        })
      }

      // Check if order is fully shipped
      const allShipmentItems = await tx.shipmentItems.findMany({
        where: {
          Shipment: {
            CustomerOrderID: BigInt(input.orderId),
          },
        },
        select: {
          OrderItemID: true,
          QuantityShipped: true,
        },
      })

      // Sum shipped quantities by order item
      const shippedByItem = new Map<string, number>()
      for (const si of allShipmentItems) {
        const key = si.OrderItemID.toString()
        shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + si.QuantityShipped)
      }

      // Check if all items fully shipped
      let fullyShipped = true
      for (const orderItem of order.CustomerOrdersItems) {
        const shipped = shippedByItem.get(orderItem.ID.toString()) ?? 0
        if (shipped < orderItem.Quantity) {
          fullyShipped = false
          break
        }
      }

      // Auto-update status if fully shipped
      if (fullyShipped) {
        await tx.customerOrders.update({
          where: { ID: BigInt(input.orderId) },
          data: {
            OrderStatus: 'Shipped',
            IsShipped: true,
          },
        })
      }

      return shipment
    })

    // Sync with Shopify if order is transferred and has Shopify order ID
    let shopifyFulfillmentId: string | null = null
    if (order.IsTransferredToShopify && order.ShopifyOrderID && shopify.isConfigured()) {
      try {
        const fulfillmentResult = await shopify.fulfillments.create(order.ShopifyOrderID, {
          fulfillment: {
            tracking_number: input.tracking?.trackingNumber,
            tracking_company: input.tracking?.carrier,
            notify_customer: false, // Don't notify - this is wholesale B2B
          },
        })

        if (fulfillmentResult.fulfillment) {
          shopifyFulfillmentId = String(fulfillmentResult.fulfillment.id)

          // Update shipment with Shopify fulfillment ID
          await prisma.shipments.update({
            where: { ID: result.ID },
            data: { ShopifyFulfillmentID: shopifyFulfillmentId },
          })
        } else if (fulfillmentResult.error) {
          // Log error but don't fail the shipment creation
          console.warn('Shopify fulfillment sync warning:', fulfillmentResult.error)
        }
      } catch (shopifyError) {
        // Log error but don't fail the shipment creation
        console.warn('Shopify fulfillment sync error:', shopifyError)
      }
    }

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${input.orderId}`)

    return {
      success: true,
      shipmentId: result.ID.toString(),
      shopifyFulfillmentId,
    }
  } catch (e) {
    console.error('createShipment error:', e)
    const message = e instanceof Error ? e.message : 'Failed to create shipment'
    return { success: false, error: message }
  }
}

// ============================================================================
// Update Shipment
// ============================================================================

export interface UpdateShipmentResult {
  success: boolean
  error?: string
}

/**
 * Update an existing shipment.
 * - Updates shipping cost, notes, and/or ship date
 * - Recalculates ShippedTotal
 */
export async function updateShipment(
  input: UpdateShipmentInput
): Promise<UpdateShipmentResult> {
  try {
    await requireAdmin()

    const shipment = await prisma.shipments.findUnique({
      where: { ID: BigInt(input.shipmentId) },
      select: {
        ID: true,
        CustomerOrderID: true,
        ShippedSubtotal: true,
        ShippingCost: true,
      },
    })

    if (!shipment) {
      return { success: false, error: 'Shipment not found' }
    }

    const newShippingCost = input.shippingCost ?? shipment.ShippingCost
    const newShippedTotal = shipment.ShippedSubtotal + newShippingCost

    await prisma.shipments.update({
      where: { ID: BigInt(input.shipmentId) },
      data: {
        ShippingCost: newShippingCost,
        ShippedTotal: newShippedTotal,
        InternalNotes: input.notes !== undefined ? input.notes : undefined,
        ShipDate: input.shipDate ? new Date(input.shipDate) : undefined,
        UpdatedAt: new Date(),
      },
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${shipment.CustomerOrderID.toString()}`)

    return { success: true }
  } catch (e) {
    console.error('updateShipment error:', e)
    const message = e instanceof Error ? e.message : 'Failed to update shipment'
    return { success: false, error: message }
  }
}

// ============================================================================
// Add Tracking Number
// ============================================================================

export interface AddTrackingResult {
  success: boolean
  trackingId?: string
  error?: string
}

/**
 * Add a tracking number to an existing shipment.
 */
export async function addTrackingNumber(
  shipmentId: string,
  tracking: TrackingInput
): Promise<AddTrackingResult> {
  try {
    await requireAdmin()

    const shipment = await prisma.shipments.findUnique({
      where: { ID: BigInt(shipmentId) },
      select: { ID: true, CustomerOrderID: true },
    })

    if (!shipment) {
      return { success: false, error: 'Shipment not found' }
    }

    const created = await prisma.shipmentTracking.create({
      data: {
        ShipmentID: BigInt(shipmentId),
        Carrier: tracking.carrier,
        TrackingNumber: tracking.trackingNumber,
        AddedAt: new Date(),
      },
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${shipment.CustomerOrderID.toString()}`)

    return {
      success: true,
      trackingId: created.ID.toString(),
    }
  } catch (e) {
    console.error('addTrackingNumber error:', e)
    const message =
      e instanceof Error ? e.message : 'Failed to add tracking number'
    return { success: false, error: message }
  }
}

// ============================================================================
// Get Shipments for Order
// ============================================================================

/**
 * Fetch all shipments for an order with items and tracking.
 * Also looks up clean Shopify SKUs for display.
 */
export async function getShipmentsForOrder(orderId: string): Promise<ShipmentRow[]> {
  try {
    await requireAdmin()

    const shipments = await prisma.shipments.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
      include: {
        CustomerOrders: {
          select: { OrderNumber: true },
        },
        ShipmentItems: {
          include: {
            OrderItem: {
              select: {
                ID: true,
                SKU: true,
                SKUVariantID: true,
                Quantity: true,
                Price: true,
                Notes: true,
              },
            },
          },
        },
        ShipmentTracking: true,
      },
      orderBy: { CreatedAt: 'desc' },
    })

    // Process shipments with Shopify SKU lookups
    const shipmentsWithShopifySku = await Promise.all(
      shipments.map(async (s): Promise<ShipmentRow> => {
        // Look up Shopify SKUs for all items in this shipment
        const itemsWithShopifySku = await Promise.all(
          s.ShipmentItems.map(async (si): Promise<ShipmentItemRow> => {
            const unitPrice = si.PriceOverride ?? si.OrderItem.Price

            // Look up clean Shopify SKU
            const shopifyVariant = await findShopifyVariant(
              si.OrderItem.SKUVariantID > 0 ? si.OrderItem.SKUVariantID : null,
              si.OrderItem.SKU
            )
            const displaySku = shopifyVariant?.skuId ?? si.OrderItem.SKU

            return {
              id: si.ID.toString(),
              orderItemId: si.OrderItemID.toString(),
              sku: displaySku,
              productName: si.OrderItem.Notes || displaySku,
              orderedQuantity: si.OrderItem.Quantity,
              shippedQuantity: si.QuantityShipped,
              unitPrice: si.OrderItem.Price,
              priceOverride: si.PriceOverride ?? undefined,
              lineTotal: unitPrice * si.QuantityShipped,
            }
          })
        )

        return {
          id: s.ID.toString(),
          orderId: s.CustomerOrderID.toString(),
          orderNumber: s.CustomerOrders.OrderNumber,
          shippedSubtotal: s.ShippedSubtotal,
          shippingCost: s.ShippingCost,
          shippedTotal: s.ShippedTotal,
          shipDate: s.ShipDate?.toISOString() ?? null,
          internalNotes: s.InternalNotes,
          createdBy: s.CreatedBy,
          createdAt: s.CreatedAt.toISOString(),
          updatedAt: s.UpdatedAt?.toISOString() ?? null,
          shopifyFulfillmentId: s.ShopifyFulfillmentID,
          tracking: s.ShipmentTracking.map((t): TrackingRecord => ({
            id: t.ID.toString(),
            carrier: t.Carrier as TrackingRecord['carrier'],
            trackingNumber: t.TrackingNumber,
            addedAt: t.AddedAt.toISOString(),
            trackingUrl: getTrackingUrl(t.Carrier as TrackingRecord['carrier'], t.TrackingNumber),
          })),
          items: itemsWithShopifySku,
        }
      })
    )

    return shipmentsWithShopifySku
  } catch (e) {
    console.error('getShipmentsForOrder error:', e)
    return []
  }
}

// ============================================================================
// Get Shipment Summary for Order (for orders table)
// ============================================================================

/**
 * Get shipment summary for an order (used in orders table display).
 */
export async function getShipmentSummaryForOrder(
  orderId: string
): Promise<OrderShipmentSummary | null> {
  try {
    const shipments = await prisma.shipments.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
      select: {
        ShippedTotal: true,
        ShipmentTracking: {
          select: { TrackingNumber: true },
        },
      },
    })

    if (shipments.length === 0) {
      return null
    }

    const totalShipped = shipments.reduce((sum, s) => sum + s.ShippedTotal, 0)
    const allTracking = shipments.flatMap((s) =>
      s.ShipmentTracking.map((t) => t.TrackingNumber)
    )

    // Get order items to check if fully shipped
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        CustomerOrdersItems: {
          select: { ID: true, Quantity: true },
        },
      },
    })

    let isFullyShipped = false
    if (order) {
      const shipmentItems = await prisma.shipmentItems.findMany({
        where: {
          Shipment: { CustomerOrderID: BigInt(orderId) },
        },
        select: {
          OrderItemID: true,
          QuantityShipped: true,
        },
      })

      const shippedByItem = new Map<string, number>()
      for (const si of shipmentItems) {
        const key = si.OrderItemID.toString()
        shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + si.QuantityShipped)
      }

      isFullyShipped = order.CustomerOrdersItems.every(
        (oi) => (shippedByItem.get(oi.ID.toString()) ?? 0) >= oi.Quantity
      )
    }

    return {
      shipmentCount: shipments.length,
      totalShipped,
      trackingCount: allTracking.length,
      trackingNumbers: allTracking.slice(0, 3), // First 3 for display
      isFullyShipped,
    }
  } catch (e) {
    console.error('getShipmentSummaryForOrder error:', e)
    return null
  }
}

// ============================================================================
// Get Order Items with Fulfillment Status
// ============================================================================

/**
 * Get order line items with shipped quantities for shipment modal.
 * Also looks up the clean Shopify SKU for display.
 */
export async function getOrderItemsWithFulfillment(
  orderId: string
): Promise<OrderItemWithFulfillment[]> {
  try {
    await requireAdmin()

    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        CustomerOrdersItems: {
          select: {
            ID: true,
            SKU: true,
            SKUVariantID: true,
            Quantity: true,
            Price: true,
            PriceCurrency: true,
            Notes: true,
          },
        },
      },
    })

    if (!order) {
      return []
    }

    // Get shipped quantities
    const shipmentItems = await prisma.shipmentItems.findMany({
      where: {
        Shipment: { CustomerOrderID: BigInt(orderId) },
      },
      select: {
        OrderItemID: true,
        QuantityShipped: true,
      },
    })

    const shippedByItem = new Map<string, number>()
    for (const si of shipmentItems) {
      const key = si.OrderItemID.toString()
      shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + si.QuantityShipped)
    }

    // Look up Shopify SKUs for all items
    const itemsWithShopify = await Promise.all(
      order.CustomerOrdersItems.map(async (item) => {
        const shippedQty = shippedByItem.get(item.ID.toString()) ?? 0

        // Look up clean Shopify SKU
        const shopifyVariant = await findShopifyVariant(
          item.SKUVariantID > 0 ? item.SKUVariantID : null,
          item.SKU
        )

        return {
          id: item.ID.toString(),
          sku: item.SKU,
          shopifySku: shopifyVariant?.skuId ?? null,
          productName: item.Notes || item.SKU,
          orderedQuantity: item.Quantity,
          shippedQuantity: shippedQty,
          remainingQuantity: Math.max(0, item.Quantity - shippedQty),
          unitPrice: item.Price,
          priceCurrency: item.PriceCurrency,
          notes: item.Notes,
        } satisfies OrderItemWithFulfillment
      })
    )

    return itemsWithShopify
  } catch (e) {
    console.error('getOrderItemsWithFulfillment error:', e)
    return []
  }
}

// ============================================================================
// Calculate Total Shipped for Order
// ============================================================================

/**
 * Calculate sum of all shipped totals for an order.
 */
export async function getShippedTotalForOrder(orderId: string): Promise<number> {
  try {
    const result = await prisma.shipments.aggregate({
      where: { CustomerOrderID: BigInt(orderId) },
      _sum: { ShippedTotal: true },
    })
    return result._sum.ShippedTotal ?? 0
  } catch (e) {
    console.error('getShippedTotalForOrder error:', e)
    return 0
  }
}

// ============================================================================
// Order Adjustments (Add/Edit/Remove Items)
// ============================================================================

export interface AddOrderItemInput {
  orderId: string
  sku: string
  quantity: number
  price: number
  notes?: string
}

export interface AddOrderItemResult {
  success: boolean
  itemId?: string
  error?: string
}

/**
 * Add a new item to an existing order.
 * Used for post-order adjustments (customer requests to add items).
 */
export async function addOrderItem(input: AddOrderItemInput): Promise<AddOrderItemResult> {
  try {
    const session = await requireAdmin()

    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(input.orderId) },
      select: {
        ID: true,
        OrderNumber: true,
        OrderStatus: true,
        Country: true,
      },
    })

    if (!order) {
      return { success: false, error: 'Order not found' }
    }

    // Don't allow adjustments to invoiced or cancelled orders
    if (order.OrderStatus === 'Invoiced' || order.OrderStatus === 'Cancelled') {
      return { success: false, error: `Cannot modify ${order.OrderStatus.toLowerCase()} orders` }
    }

    const currency = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'

    const item = await prisma.customerOrdersItems.create({
      data: {
        CustomerOrderID: BigInt(input.orderId),
        OrderNumber: order.OrderNumber,
        SKU: input.sku,
        SKUVariantID: BigInt(0), // Manual adjustment - no variant
        Quantity: input.quantity,
        Price: input.price,
        PriceCurrency: currency,
        Notes: input.notes || `Added by ${session.user.name || session.user.loginId}`,
      },
    })

    // Update order total
    const newTotal = await recalculateOrderTotal(input.orderId)
    await prisma.customerOrders.update({
      where: { ID: BigInt(input.orderId) },
      data: { OrderAmount: newTotal },
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${input.orderId}`)

    return { success: true, itemId: item.ID.toString() }
  } catch (e) {
    console.error('addOrderItem error:', e)
    const message = e instanceof Error ? e.message : 'Failed to add item'
    return { success: false, error: message }
  }
}

export interface UpdateOrderItemInput {
  itemId: string
  quantity?: number
  price?: number
  notes?: string
}

export interface UpdateOrderItemResult {
  success: boolean
  error?: string
}

/**
 * Update an existing order item's quantity, price, or notes.
 */
export async function updateOrderItem(input: UpdateOrderItemInput): Promise<UpdateOrderItemResult> {
  try {
    await requireAdmin()

    const item = await prisma.customerOrdersItems.findUnique({
      where: { ID: BigInt(input.itemId) },
      select: {
        ID: true,
        CustomerOrderID: true,
        CustomerOrders: {
          select: { OrderStatus: true },
        },
      },
    })

    if (!item) {
      return { success: false, error: 'Item not found' }
    }

    // Don't allow adjustments to invoiced or cancelled orders
    const status = item.CustomerOrders.OrderStatus
    if (status === 'Invoiced' || status === 'Cancelled') {
      return { success: false, error: `Cannot modify ${status.toLowerCase()} orders` }
    }

    await prisma.customerOrdersItems.update({
      where: { ID: BigInt(input.itemId) },
      data: {
        Quantity: input.quantity,
        Price: input.price,
        Notes: input.notes,
      },
    })

    // Recalculate order total
    const orderId = item.CustomerOrderID.toString()
    const newTotal = await recalculateOrderTotal(orderId)
    await prisma.customerOrders.update({
      where: { ID: item.CustomerOrderID },
      data: { OrderAmount: newTotal },
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)

    return { success: true }
  } catch (e) {
    console.error('updateOrderItem error:', e)
    const message = e instanceof Error ? e.message : 'Failed to update item'
    return { success: false, error: message }
  }
}

export interface RemoveOrderItemResult {
  success: boolean
  error?: string
}

/**
 * Remove an item from an order.
 * Only allowed if the item hasn't been shipped yet.
 */
export async function removeOrderItem(itemId: string): Promise<RemoveOrderItemResult> {
  try {
    await requireAdmin()

    const item = await prisma.customerOrdersItems.findUnique({
      where: { ID: BigInt(itemId) },
      select: {
        ID: true,
        SKU: true,
        CustomerOrderID: true,
        CustomerOrders: {
          select: { OrderStatus: true },
        },
      },
    })

    if (!item) {
      return { success: false, error: 'Item not found' }
    }

    // Don't allow adjustments to invoiced or cancelled orders
    const status = item.CustomerOrders.OrderStatus
    if (status === 'Invoiced' || status === 'Cancelled') {
      return { success: false, error: `Cannot modify ${status.toLowerCase()} orders` }
    }

    // Check if item has been shipped
    const shippedItems = await prisma.shipmentItems.findMany({
      where: { OrderItemID: BigInt(itemId) },
      select: { QuantityShipped: true },
    })

    const totalShipped = shippedItems.reduce((sum, si) => sum + si.QuantityShipped, 0)
    if (totalShipped > 0) {
      return {
        success: false,
        error: `Cannot remove ${item.SKU} - ${totalShipped} units have already been shipped`,
      }
    }

    await prisma.customerOrdersItems.delete({
      where: { ID: BigInt(itemId) },
    })

    // Recalculate order total
    const orderId = item.CustomerOrderID.toString()
    const newTotal = await recalculateOrderTotal(orderId)
    await prisma.customerOrders.update({
      where: { ID: item.CustomerOrderID },
      data: { OrderAmount: newTotal },
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)

    return { success: true }
  } catch (e) {
    console.error('removeOrderItem error:', e)
    const message = e instanceof Error ? e.message : 'Failed to remove item'
    return { success: false, error: message }
  }
}

/**
 * Recalculate order total from line items.
 */
async function recalculateOrderTotal(orderId: string): Promise<number> {
  const items = await prisma.customerOrdersItems.findMany({
    where: { CustomerOrderID: BigInt(orderId) },
    select: { Quantity: true, Price: true },
  })

  return items.reduce((sum, item) => sum + (item.Quantity * item.Price), 0)
}

// ============================================================================
// Batch Get Shipment Summaries (for orders list)
// ============================================================================

/**
 * Get shipment summaries for multiple orders (optimized for orders table).
 * Returns a map of orderId -> summary.
 */
export async function getShipmentSummariesForOrders(
  orderIds: string[]
): Promise<Map<string, OrderShipmentSummary>> {
  try {
    if (orderIds.length === 0) {
      return new Map()
    }

    const bigIntIds = orderIds.map((id) => BigInt(id))

    // Get all shipments for these orders
    const shipments = await prisma.shipments.findMany({
      where: { CustomerOrderID: { in: bigIntIds } },
      select: {
        CustomerOrderID: true,
        ShippedTotal: true,
        ShipmentTracking: {
          select: { TrackingNumber: true },
        },
      },
    })

    // Get order items for fully shipped check
    const orders = await prisma.customerOrders.findMany({
      where: { ID: { in: bigIntIds } },
      select: {
        ID: true,
        CustomerOrdersItems: {
          select: { ID: true, Quantity: true },
        },
      },
    })

    // Get all shipment items
    const shipmentItems = await prisma.shipmentItems.findMany({
      where: {
        Shipment: { CustomerOrderID: { in: bigIntIds } },
      },
      select: {
        OrderItemID: true,
        QuantityShipped: true,
        Shipment: {
          select: { CustomerOrderID: true },
        },
      },
    })

    // Build shipped quantities map: orderId -> (orderItemId -> shippedQty)
    const shippedByOrder = new Map<string, Map<string, number>>()
    for (const si of shipmentItems) {
      const orderId = si.Shipment.CustomerOrderID.toString()
      if (!shippedByOrder.has(orderId)) {
        shippedByOrder.set(orderId, new Map())
      }
      const itemMap = shippedByOrder.get(orderId)!
      const itemKey = si.OrderItemID.toString()
      itemMap.set(itemKey, (itemMap.get(itemKey) ?? 0) + si.QuantityShipped)
    }

    // Build summaries
    const summaries = new Map<string, OrderShipmentSummary>()

    // Group shipments by order
    const shipmentsByOrder = new Map<string, typeof shipments>()
    for (const s of shipments) {
      const orderId = s.CustomerOrderID.toString()
      if (!shipmentsByOrder.has(orderId)) {
        shipmentsByOrder.set(orderId, [])
      }
      shipmentsByOrder.get(orderId)!.push(s)
    }

    // Build order items map
    const orderItemsMap = new Map<string, typeof orders[0]['CustomerOrdersItems']>()
    for (const o of orders) {
      orderItemsMap.set(o.ID.toString(), o.CustomerOrdersItems)
    }

    for (const [orderId, orderShipments] of shipmentsByOrder) {
      const totalShipped = orderShipments.reduce((sum, s) => sum + s.ShippedTotal, 0)
      const allTracking = orderShipments.flatMap((s) =>
        s.ShipmentTracking.map((t) => t.TrackingNumber)
      )

      // Check if fully shipped
      const orderItems = orderItemsMap.get(orderId) ?? []
      const shippedItems = shippedByOrder.get(orderId) ?? new Map()
      const isFullyShipped = orderItems.every(
        (oi) => (shippedItems.get(oi.ID.toString()) ?? 0) >= oi.Quantity
      )

      summaries.set(orderId, {
        shipmentCount: orderShipments.length,
        totalShipped,
        trackingCount: allTracking.length,
        trackingNumbers: allTracking.slice(0, 3),
        isFullyShipped,
      })
    }

    return summaries
  } catch (e) {
    console.error('getShipmentSummariesForOrders error:', e)
    return new Map()
  }
}
