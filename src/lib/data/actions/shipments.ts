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
  Carrier,
  CreateShipmentResult,
  UpdateShipmentResult,
  AddTrackingResult,
  VoidShipmentInput,
  VoidShipmentResult,
  AddOrderItemInput,
  AddOrderItemResult,
  UpdateOrderItemInput,
  UpdateOrderItemResult,
  RemoveOrderItemResult,
  CancelOrderItemResult,
  BulkCancelResult,
  ResendShipmentEmailInput,
  ResendShipmentEmailResult,
} from '@/lib/types/shipment'
import { getTrackingUrl } from '@/lib/types/shipment'
import { findShopifyVariant } from '@/lib/data/queries/shopify'
import { generateShipmentDocuments } from '@/lib/pdf/generate-shipment-documents'
import { sendShipmentEmails } from '@/lib/email/shipment-email-service'
import { logShipmentCreated, logShipmentVoided, logItemCancelled } from '@/lib/audit/activity-logger'

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
// Update Order Email
// ============================================================================

/**
 * Update the customer email on an order record.
 */
export async function updateOrderEmail(
  orderId: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()

    await prisma.customerOrders.update({
      where: { ID: BigInt(orderId) },
      data: { CustomerEmail: email },
    })

    revalidatePath(`/admin/orders/${orderId}`)
    return { success: true }
  } catch (e) {
    console.error('updateOrderEmail error:', e)
    return { success: false, error: 'Failed to update email' }
  }
}

// ============================================================================
// Phase 6: PlannedShipment Status Helper
// ============================================================================

/**
 * Phase 6: Recalculate and update PlannedShipment.Status based on fulfillment progress.
 * Called after creating or voiding a shipment.
 *
 * Status logic:
 * - Planned: No items shipped yet
 * - PartiallyFulfilled: Some items shipped, some remaining
 * - Fulfilled: All items fully shipped (shipped + cancelled >= ordered)
 * - Cancelled: All items cancelled
 */
export async function updatePlannedShipmentStatus(
  plannedShipmentId: bigint
): Promise<void> {
  // Get all items in this planned shipment with their shipped quantities
  const items = await prisma.customerOrdersItems.findMany({
    where: { PlannedShipmentID: plannedShipmentId },
    select: {
      ID: true,
      Quantity: true,
      CancelledQty: true,
      ShipmentItems: {
        select: { QuantityShipped: true },
        where: { Shipment: { VoidedAt: null } }, // Exclude voided shipments
      },
    },
  })

  if (items.length === 0) return

  let totalOrdered = 0
  let totalShipped = 0
  let totalCancelled = 0

  for (const item of items) {
    totalOrdered += item.Quantity
    totalCancelled += item.CancelledQty ?? 0 // Defensive null handling
    totalShipped += item.ShipmentItems.reduce((sum, si) => sum + si.QuantityShipped, 0)
  }

  const totalRemaining = totalOrdered - totalShipped - totalCancelled

  let newStatus: string
  if (totalCancelled === totalOrdered) {
    newStatus = 'Cancelled'
  } else if (totalRemaining <= 0) {
    newStatus = 'Fulfilled'
  } else if (totalShipped > 0) {
    newStatus = 'PartiallyFulfilled'
  } else {
    newStatus = 'Planned'
  }

  await prisma.plannedShipment.update({
    where: { ID: plannedShipmentId },
    data: {
      Status: newStatus,
      UpdatedAt: new Date(),
    },
  })
}

// ============================================================================
// Create Shipment
// ============================================================================

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

    // Track emails sent for result
    const emailsSent: {
      customer?: { email: string; attachments: string[] }
      rep?: { email: string }
      shopify?: boolean
    } = {}

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
            CancelledQty: true,
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

    // Phase 6: Validate plannedShipmentId if provided
    let plannedShipmentBigInt: bigint | null = null
    if (input.plannedShipmentId) {
      const plannedShipment = await prisma.plannedShipment.findUnique({
        where: { ID: BigInt(input.plannedShipmentId) },
        select: { ID: true, CustomerOrderID: true },
      })
      if (!plannedShipment) {
        return { success: false, error: 'Planned shipment not found' }
      }
      if (String(plannedShipment.CustomerOrderID) !== input.orderId) {
        return { success: false, error: 'Planned shipment does not belong to this order' }
      }
      plannedShipmentBigInt = plannedShipment.ID
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
          PlannedShipmentID: plannedShipmentBigInt, // Phase 6
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

      // Check if all items fully shipped (considering cancelled items)
      let fullyShipped = true
      const hasShipments = allShipmentItems.length > 0
      
      for (const orderItem of order.CustomerOrdersItems) {
        const shipped = shippedByItem.get(orderItem.ID.toString()) ?? 0
        const cancelledQty = orderItem.CancelledQty ?? 0
        const effectiveQuantity = orderItem.Quantity - cancelledQty
        if (shipped < effectiveQuantity) {
          fullyShipped = false
          break
        }
      }

      // Auto-update status based on shipment state
      // Only update if not already Invoiced or Cancelled
      const currentStatus = order.OrderStatus
      if (currentStatus !== 'Invoiced' && currentStatus !== 'Cancelled') {
        if (fullyShipped) {
          await tx.customerOrders.update({
            where: { ID: BigInt(input.orderId) },
            data: {
              OrderStatus: 'Shipped',
              IsShipped: true,
            },
          })
        } else if (hasShipments && currentStatus !== 'Partially Shipped') {
          // Set to Partially Shipped if there are shipments but not fully shipped
          await tx.customerOrders.update({
            where: { ID: BigInt(input.orderId) },
            data: {
              OrderStatus: 'Partially Shipped',
            },
          })
        }
      }

      return shipment
    })

    // Phase 6: Update PlannedShipment status
    if (plannedShipmentBigInt) {
      await updatePlannedShipmentStatus(plannedShipmentBigInt)
    }

    // Sync with Shopify if order is transferred and has Shopify order ID
    let shopifyFulfillmentId: string | null = null
    if (order.IsTransferredToShopify && order.ShopifyOrderID && shopify.isConfigured()) {
      try {
        const fulfillmentResult = await shopify.fulfillments.create(order.ShopifyOrderID, {
          fulfillment: {
            tracking_number: input.tracking?.trackingNumber,
            tracking_company: input.tracking?.carrier,
            notify_customer: input.notifyShopify ?? false, // Shopify's built-in notification
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

    // Generate and store shipment documents (packing slip + invoice)
    try {
      await generateShipmentDocuments({
        shipmentId: result.ID.toString(),
        generatedBy: userName,
      })
    } catch (docError) {
      // Log error but don't fail shipment creation - documents can be regenerated
      console.warn('Document generation warning:', docError)
    }

    // Log activity
    await logShipmentCreated({
      shipmentId: result.ID.toString(),
      orderId: input.orderId,
      orderNumber: order.OrderNumber || '',
      unitsShipped: input.items.reduce((sum, i) => sum + i.quantityShipped, 0),
      totalAmount: shippedTotal,
      performedBy: userName,
    })

    // Send notification emails if requested
    if (input.notifyCustomer || input.notifyRep) {
      try {
        // Get full order details for email
        const orderDetails = await prisma.customerOrders.findUnique({
          where: { ID: BigInt(input.orderId) },
          select: {
            OrderNumber: true,
            StoreName: true,
            BuyerName: true,
            CustomerEmail: true,
            SalesRep: true,
            OrderAmount: true,
            Country: true,
          },
        })

        // Get all shipments to calculate shipment number and totals
        const allShipments = await prisma.shipments.findMany({
          where: { CustomerOrderID: BigInt(input.orderId) },
          orderBy: { CreatedAt: 'asc' },
          select: { ID: true, ShippedTotal: true },
        })
        const shipmentIndex = allShipments.findIndex((s) => s.ID === result.ID)
        const shipmentNumber = shipmentIndex + 1
        const totalShipments = allShipments.length
        const previouslyShipped = allShipments
          .filter((s) => s.ID < result.ID)
          .reduce((sum, s) => sum + (s.ShippedTotal || 0), 0)

        // Get shipped items with SKU details
        const shipmentItems = await prisma.shipmentItems.findMany({
          where: { ShipmentID: result.ID },
          include: {
            OrderItem: {
              select: {
                SKU: true,
                Price: true,
              },
            },
          },
        })

        // Get SKU details
        const skuIds = shipmentItems.map((si) => si.OrderItem?.SKU).filter(Boolean) as string[]
        const skus = await prisma.sku.findMany({
          where: { SkuID: { in: skuIds } },
          select: { SkuID: true, OrderEntryDescription: true, Description: true },
        })
        const skuMap = new Map(skus.map((s) => [s.SkuID, s]))

        const emailItems = shipmentItems.map((si) => {
          const sku = skuMap.get(si.OrderItem?.SKU || '')
          const unitPrice = si.PriceOverride ?? si.OrderItem?.Price ?? 0
          return {
            sku: si.OrderItem?.SKU || 'Unknown',
            productName: sku?.OrderEntryDescription || sku?.Description || si.OrderItem?.SKU || 'Unknown',
            quantity: si.QuantityShipped,
            unitPrice,
            lineTotal: unitPrice * si.QuantityShipped,
          }
        })

        const currency: 'USD' | 'CAD' = orderDetails?.Country === 'Canada' ? 'CAD' : 'USD'
        const remainingBalance = (orderDetails?.OrderAmount || 0) - previouslyShipped - shippedTotal

        // Get sales rep email
        let salesRepEmail: string | undefined
        if (orderDetails?.SalesRep) {
          const rep = await prisma.reps.findFirst({
            where: { Name: orderDetails.SalesRep },
            select: { Email1: true, Email2: true },
          })
          salesRepEmail = rep?.Email1 || rep?.Email2 || undefined
        }

        await sendShipmentEmails({
          shipmentId: result.ID.toString(),
          orderId: input.orderId,
          orderNumber: orderDetails?.OrderNumber || '',
          storeName: orderDetails?.StoreName || '',
          buyerName: orderDetails?.BuyerName || '',
          customerEmail: input.customerEmailOverride || orderDetails?.CustomerEmail || '',
          salesRep: orderDetails?.SalesRep || '',
          salesRepEmail,
          shipmentNumber,
          totalShipments,
          shipDate: input.shipDate ? new Date(input.shipDate) : new Date(),
          carrier: input.tracking?.carrier,
          trackingNumber: input.tracking?.trackingNumber,
          items: emailItems,
          currency,
          subtotal: shippedSubtotal,
          shippingCost: input.shippingCost,
          shipmentTotal: shippedTotal,
          orderTotal: orderDetails?.OrderAmount || 0,
          previouslyShipped,
          remainingBalance: Math.max(0, remainingBalance),
          notifyCustomer: input.notifyCustomer ?? false,
          attachInvoice: input.attachInvoice ?? false,
          attachPackingSlip: input.attachPackingSlip ?? false,
          notifyRep: input.notifyRep ?? false,
          performedBy: userName,
        })

        // Track what was sent
        const effectiveEmail = input.customerEmailOverride || orderDetails?.CustomerEmail || ''
        if (input.notifyCustomer && effectiveEmail) {
          const attachments: string[] = []
          if (input.attachInvoice) attachments.push('Invoice PDF')
          if (input.attachPackingSlip) attachments.push('Packing Slip PDF')
          emailsSent.customer = { email: effectiveEmail, attachments }
        }
        if (input.notifyRep && orderDetails?.SalesRep) {
          // Get rep email from Reps table
          const rep = await prisma.reps.findFirst({
            where: { Name: orderDetails.SalesRep },
            select: { Email1: true, Email2: true },
          })
          const repEmailAddr = rep?.Email1 || rep?.Email2
          if (repEmailAddr) {
            emailsSent.rep = { email: repEmailAddr }
          }
        }
      } catch (emailError) {
        // Log error but don't fail shipment creation
        console.warn('Email sending warning:', emailError)
      }
    }

    // Track Shopify notification
    if (input.notifyShopify && shopifyFulfillmentId) {
      emailsSent.shopify = true
    }

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${input.orderId}`)

    return {
      success: true,
      shipmentId: result.ID.toString(),
      shopifyFulfillmentId,
      emailsSent: Object.keys(emailsSent).length > 0 ? emailsSent : undefined,
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
// Void Shipment
// ============================================================================

/**
 * Void a shipment - marks it as voided without deleting (preserves audit trail).
 * Recalculates order status based on remaining non-voided shipments.
 */
export async function voidShipment(input: VoidShipmentInput): Promise<VoidShipmentResult> {
  try {
    const session = await requireAdmin()
    const userName = session?.user?.name || session?.user?.loginId || 'System'

    const shipment = await prisma.shipments.findUnique({
      where: { ID: BigInt(input.shipmentId) },
      select: {
        ID: true,
        CustomerOrderID: true,
        VoidedAt: true,
        PlannedShipmentID: true, // Phase 6
        CustomerOrders: {
          select: {
            ID: true,
            OrderNumber: true,
            OrderStatus: true,
            CustomerOrdersItems: {
              select: {
                ID: true,
                Quantity: true,
                CancelledQty: true,
              },
            },
          },
        },
      },
    })

    if (!shipment) {
      return { success: false, error: 'Shipment not found' }
    }

    if (shipment.VoidedAt) {
      return { success: false, error: 'Shipment is already voided' }
    }

    const orderId = shipment.CustomerOrderID.toString()
    const order = shipment.CustomerOrders
    const currentStatus = order.OrderStatus

    // Don't allow voiding on invoiced orders
    if (currentStatus === 'Invoiced') {
      return { success: false, error: 'Cannot void shipments on invoiced orders' }
    }

    // Mark shipment as voided (soft delete)
    await prisma.shipments.update({
      where: { ID: BigInt(input.shipmentId) },
      data: {
        VoidedAt: new Date(),
        VoidedBy: userName,
        VoidReason: input.reason,
        VoidNotes: input.notes?.trim() || null,
      },
    })

    // Recalculate order status based on remaining non-voided shipments
    const remainingShipments = await prisma.shipments.findMany({
      where: {
        CustomerOrderID: BigInt(orderId),
        VoidedAt: null,
      },
      include: {
        ShipmentItems: {
          select: {
            OrderItemID: true,
            QuantityShipped: true,
          },
        },
      },
    })

    // Sum shipped quantities from non-voided shipments
    const shippedByItem = new Map<string, number>()
    for (const s of remainingShipments) {
      for (const si of s.ShipmentItems) {
        const key = si.OrderItemID.toString()
        shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + si.QuantityShipped)
      }
    }

    // Determine new order status
    const hasAnyShipments = remainingShipments.length > 0
    let fullyShipped = true

    for (const orderItem of order.CustomerOrdersItems) {
      const shipped = shippedByItem.get(orderItem.ID.toString()) ?? 0
      const cancelledQty = orderItem.CancelledQty ?? 0
      const effectiveQuantity = orderItem.Quantity - cancelledQty
      if (shipped < effectiveQuantity) {
        fullyShipped = false
        break
      }
    }

    // Update order status if needed
    if (currentStatus !== 'Cancelled') {
      let newStatus: string
      if (fullyShipped && hasAnyShipments) {
        newStatus = 'Shipped'
      } else if (hasAnyShipments) {
        newStatus = 'Partially Shipped'
      } else {
        newStatus = 'Pending'
      }

      if (newStatus !== currentStatus) {
        await prisma.customerOrders.update({
          where: { ID: BigInt(orderId) },
          data: {
            OrderStatus: newStatus,
            IsShipped: newStatus === 'Shipped',
          },
        })
      }
    }

    // Phase 6: Recalculate PlannedShipment status (voiding may revert to Planned/PartiallyFulfilled)
    if (shipment.PlannedShipmentID) {
      await updatePlannedShipmentStatus(shipment.PlannedShipmentID)
    }

    // Log activity
    await logShipmentVoided({
      shipmentId: input.shipmentId,
      orderId,
      orderNumber: order.OrderNumber || '',
      reason: input.notes ? `${input.reason}: ${input.notes}` : input.reason,
      performedBy: userName,
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)
    revalidatePath('/admin/open-items')

    return { success: true }
  } catch (e) {
    console.error('voidShipment error:', e)
    const message = e instanceof Error ? e.message : 'Failed to void shipment'
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
          // Void status
          isVoided: s.VoidedAt !== null,
          voidedAt: s.VoidedAt?.toISOString() ?? null,
          voidedBy: s.VoidedBy ?? null,
          voidReason: s.VoidReason ?? null,
          voidNotes: s.VoidNotes ?? null,
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
            Status: true,
            CancelledQty: true,
            CancelledReason: true,
            CancelledAt: true,
            CancelledBy: true,
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
        const cancelledQty = item.CancelledQty ?? 0
        const remainingQty = Math.max(0, item.Quantity - shippedQty - cancelledQty)

        // Determine status
        let status: 'Open' | 'Shipped' | 'Cancelled' = (item.Status as 'Open' | 'Shipped' | 'Cancelled') || 'Open'
        if (status === 'Open') {
          // Auto-determine status based on quantities
          if (cancelledQty >= item.Quantity) {
            status = 'Cancelled'
          } else if (shippedQty >= item.Quantity - cancelledQty) {
            status = 'Shipped'
          }
        }

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
          cancelledQuantity: cancelledQty,
          remainingQuantity: remainingQty,
          unitPrice: item.Price,
          priceCurrency: item.PriceCurrency,
          notes: item.Notes,
          status,
          cancelledReason: (item.CancelledReason as OrderItemWithFulfillment['cancelledReason']) ?? null,
          cancelledAt: item.CancelledAt?.toISOString() ?? null,
          cancelledBy: item.CancelledBy ?? null,
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
// Cancel Order Item
// ============================================================================

/**
 * Cancel all or part of an order item's quantity.
 * Used when items are no longer available (out of stock, discontinued, etc.)
 */
export async function cancelOrderItem(
  itemId: string,
  quantity: number,
  reason: string
): Promise<CancelOrderItemResult> {
  try {
    const session = await requireAdmin()
    const userName = session.user.name || session.user.loginId

    const item = await prisma.customerOrdersItems.findUnique({
      where: { ID: BigInt(itemId) },
      select: {
        ID: true,
        SKU: true,
        Quantity: true,
        CustomerOrderID: true,
        CancelledQty: true,
        PlannedShipmentID: true, // Phase 6: For status update
        CustomerOrders: {
          select: { OrderNumber: true, OrderStatus: true },
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

    // Get shipped quantity
    const shippedItems = await prisma.shipmentItems.findMany({
      where: { OrderItemID: BigInt(itemId) },
      select: { QuantityShipped: true },
    })
    const totalShipped = shippedItems.reduce((sum, si) => sum + si.QuantityShipped, 0)

    // Calculate max cancellable quantity
    const currentCancelled = item.CancelledQty ?? 0
    const maxCancellable = item.Quantity - totalShipped - currentCancelled

    if (quantity <= 0) {
      return { success: false, error: 'Quantity must be greater than 0' }
    }

    if (quantity > maxCancellable) {
      return {
        success: false,
        error: `Cannot cancel ${quantity} units. Only ${maxCancellable} units are available to cancel.`,
      }
    }

    const newCancelledQty = currentCancelled + quantity
    const newStatus = newCancelledQty >= item.Quantity - totalShipped ? 'Cancelled' : 'Open'

    await prisma.customerOrdersItems.update({
      where: { ID: BigInt(itemId) },
      data: {
        CancelledQty: newCancelledQty,
        CancelledReason: reason,
        CancelledAt: new Date(),
        CancelledBy: userName,
        Status: newStatus,
      },
    })

    const orderId = item.CustomerOrderID.toString()

    // Log activity
    await logItemCancelled({
      itemId,
      orderId,
      orderNumber: item.CustomerOrders.OrderNumber || '',
      sku: item.SKU,
      quantity,
      reason,
      performedBy: userName,
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)

    // Phase 6: Update PlannedShipment status if item belongs to one
    if (item.PlannedShipmentID) {
      await updatePlannedShipmentStatus(item.PlannedShipmentID)
    }

    return { success: true }
  } catch (e) {
    console.error('cancelOrderItem error:', e)
    const message = e instanceof Error ? e.message : 'Failed to cancel item'
    return { success: false, error: message }
  }
}

// ============================================================================
// Bulk Cancel Items
// ============================================================================

/**
 * Cancel all remaining units for multiple order items at once.
 */
export async function bulkCancelItems(
  itemIds: string[],
  reason: string
): Promise<BulkCancelResult> {
  try {
    const session = await requireAdmin()
    const userName = session.user.name || session.user.loginId

    if (itemIds.length === 0) {
      return { success: false, error: 'No items to cancel' }
    }

    // Get all items with their shipped quantities
    const items = await prisma.customerOrdersItems.findMany({
      where: { ID: { in: itemIds.map((id) => BigInt(id)) } },
      select: {
        ID: true,
        SKU: true,
        Quantity: true,
        CustomerOrderID: true,
        CancelledQty: true,
        PlannedShipmentID: true, // Phase 6: For status update
        CustomerOrders: {
          select: { OrderStatus: true },
        },
      },
    })

    // Get shipped quantities for all items
    const shipmentItems = await prisma.shipmentItems.findMany({
      where: { OrderItemID: { in: itemIds.map((id) => BigInt(id)) } },
      select: {
        OrderItemID: true,
        QuantityShipped: true,
      },
    })

    // Build shipped quantity map
    const shippedByItem = new Map<string, number>()
    for (const si of shipmentItems) {
      const key = si.OrderItemID.toString()
      shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + si.QuantityShipped)
    }

    // Process each item
    let cancelledCount = 0
    const orderIdsToRevalidate = new Set<string>()
    const affectedPlannedShipmentIds = new Set<bigint>() // Phase 6: Track affected PlannedShipments

    for (const item of items) {
      // Skip invoiced/cancelled orders
      const status = item.CustomerOrders.OrderStatus
      if (status === 'Invoiced' || status === 'Cancelled') {
        continue
      }

      const itemIdStr = item.ID.toString()
      const totalShipped = shippedByItem.get(itemIdStr) ?? 0
      const currentCancelled = item.CancelledQty ?? 0
      const remainingToCancelQty = item.Quantity - totalShipped - currentCancelled

      if (remainingToCancelQty > 0) {
        await prisma.customerOrdersItems.update({
          where: { ID: item.ID },
          data: {
            CancelledQty: currentCancelled + remainingToCancelQty,
            CancelledReason: reason,
            CancelledAt: new Date(),
            CancelledBy: userName,
            Status: 'Cancelled',
          },
        })
        cancelledCount++
        orderIdsToRevalidate.add(item.CustomerOrderID.toString())
        // Phase 6: Track PlannedShipment for status update
        if (item.PlannedShipmentID) {
          affectedPlannedShipmentIds.add(item.PlannedShipmentID)
        }
      }
    }

    // Revalidate all affected pages
    revalidatePath('/admin/orders')
    revalidatePath('/admin/open-items')
    for (const orderId of orderIdsToRevalidate) {
      revalidatePath(`/admin/orders/${orderId}`)
    }

    // Phase 6: Update PlannedShipment status for all affected shipments
    for (const psId of affectedPlannedShipmentIds) {
      await updatePlannedShipmentStatus(psId)
    }

    return { success: true, cancelledCount }
  } catch (e) {
    console.error('bulkCancelItems error:', e)
    const message = e instanceof Error ? e.message : 'Failed to cancel items'
    return { success: false, error: message }
  }
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

// ============================================================================
// Resend Shipment Email
// ============================================================================

/**
 * Resend shipment notification email.
 */
export async function resendShipmentEmail(
  input: ResendShipmentEmailInput
): Promise<ResendShipmentEmailResult> {
  try {
    const session = await requireAdmin()
    const userName = session.user.name || session.user.loginId || 'Admin'

    // Fetch shipment with all needed data
    const shipment = await prisma.shipments.findUnique({
      where: { ID: BigInt(input.shipmentId) },
      include: {
        ShipmentItems: {
          include: {
            OrderItem: {
              select: {
                ID: true,
                SKU: true,
                Price: true,
              },
            },
          },
        },
        ShipmentTracking: true,
        CustomerOrders: {
          select: {
            ID: true,
            OrderNumber: true,
            StoreName: true,
            BuyerName: true,
            CustomerEmail: true,
            SalesRep: true,
            OrderAmount: true,
            Country: true,
            RepID: true,
          },
        },
      },
    })

    if (!shipment) {
      return { success: false, error: 'Shipment not found' }
    }

    if (shipment.VoidedAt) {
      return { success: false, error: 'Cannot resend email for voided shipment' }
    }

    const order = shipment.CustomerOrders

    // Get rep email if sending to rep
    let repEmail: string | undefined
    if (input.recipient === 'rep' && order.RepID) {
      const rep = await prisma.reps.findUnique({
        where: { ID: order.RepID },
        select: { Email1: true },
      })
      repEmail = rep?.Email1 || undefined
    }

    if (input.recipient === 'rep' && !repEmail) {
      return { success: false, error: 'Rep email not found' }
    }

    // Count shipments for this order
    const totalShipments = await prisma.shipments.count({
      where: { CustomerOrderID: order.ID, VoidedAt: null },
    })

    const shipmentsBeforeThis = await prisma.shipments.count({
      where: {
        CustomerOrderID: order.ID,
        ID: { lt: shipment.ID },
        VoidedAt: null,
      },
    })
    const shipmentNumber = shipmentsBeforeThis + 1

    // Calculate previously shipped
    const previousShipments = await prisma.shipments.findMany({
      where: {
        CustomerOrderID: order.ID,
        ID: { lt: shipment.ID },
        VoidedAt: null,
      },
      select: { ShippedTotal: true },
    })
    const previouslyShipped = previousShipments.reduce((sum, s) => sum + s.ShippedTotal, 0)

    // Get SKU details for items
    const skuIds = shipment.ShipmentItems.map((si) => si.OrderItem?.SKU).filter(Boolean) as string[]
    const skus = await prisma.sku.findMany({
      where: { SkuID: { in: skuIds } },
      select: { SkuID: true, OrderEntryDescription: true, Description: true },
    })
    const skuMap = new Map(skus.map((s) => [s.SkuID, s]))

    const emailItems = shipment.ShipmentItems.map((si) => {
      const sku = skuMap.get(si.OrderItem?.SKU || '')
      const unitPrice = si.PriceOverride ?? si.OrderItem?.Price ?? 0
      return {
        sku: si.OrderItem?.SKU || 'Unknown',
        productName: sku?.OrderEntryDescription || sku?.Description || si.OrderItem?.SKU || 'Unknown',
        quantity: si.QuantityShipped,
        unitPrice,
        lineTotal: unitPrice * si.QuantityShipped,
      }
    })

    const currency: 'USD' | 'CAD' = order.Country === 'Canada' ? 'CAD' : 'USD'
    const remainingBalance = Math.max(0, (order.OrderAmount || 0) - previouslyShipped - shipment.ShippedTotal)

    // Get tracking info
    const tracking = shipment.ShipmentTracking[0]

    await sendShipmentEmails({
      shipmentId: input.shipmentId,
      orderId: order.ID.toString(),
      orderNumber: order.OrderNumber || '',
      storeName: order.StoreName || '',
      buyerName: order.BuyerName || '',
      customerEmail: order.CustomerEmail || '',
      salesRep: order.SalesRep || '',
      salesRepEmail: repEmail,
      shipmentNumber,
      totalShipments,
      shipDate: shipment.ShipDate || new Date(),
      carrier: input.includeTracking && tracking ? (tracking.Carrier as Carrier) : undefined,
      trackingNumber: input.includeTracking && tracking ? tracking.TrackingNumber : undefined,
      items: emailItems,
      currency,
      subtotal: shipment.ShippedSubtotal,
      shippingCost: shipment.ShippingCost,
      shipmentTotal: shipment.ShippedTotal,
      orderTotal: order.OrderAmount || 0,
      previouslyShipped,
      remainingBalance,
      notifyCustomer: input.recipient === 'customer',
      attachInvoice: input.attachInvoice,
      attachPackingSlip: false,
      notifyRep: input.recipient === 'rep',
      performedBy: userName,
    })

    return { success: true }
  } catch (e) {
    console.error('resendShipmentEmail error:', e)
    const message = e instanceof Error ? e.message : 'Failed to resend email'
    return { success: false, error: message }
  }
}
