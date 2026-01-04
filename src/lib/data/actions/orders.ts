'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import type { OrderStatus } from '@/lib/types/order'
import { createOrderInputSchema, type CreateOrderInput } from '@/lib/schemas/order'

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
// Order Status Actions
// ============================================================================

/**
 * Update a single order's status.
 * Matches .NET: ddlCurrentOrderStatus_SelectedIndexChanged
 */
export async function updateOrderStatus(input: {
  orderId: string
  newStatus: OrderStatus
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()
    
    await prisma.customerOrders.update({
      where: { ID: BigInt(input.orderId) },
      data: { OrderStatus: input.newStatus },
    })

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update status'
    return { success: false, error: message }
  }
}

/**
 * Bulk update status for multiple orders.
 */
export async function bulkUpdateStatus(input: {
  orderIds: string[]
  newStatus: OrderStatus
}): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    await requireAdmin()
    
    const result = await prisma.customerOrders.updateMany({
      where: { ID: { in: input.orderIds.map((id) => BigInt(id)) } },
      data: { OrderStatus: input.newStatus },
    })

    revalidatePath('/admin/orders')
    return { success: true, updated: result.count }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to bulk update status'
    return { success: false, updated: 0, error: message }
  }
}

// ============================================================================
// Comments Actions
// ============================================================================

/**
 * Add a comment to an order.
 * Matches .NET: btnAddComment_Click
 */
export async function addOrderComment(input: {
  orderId: string
  text: string
}): Promise<{ success: boolean; commentId?: string; error?: string }> {
  try {
    const session = await requireAdmin()
    
    const created = await prisma.customerOrdersComments.create({
      data: {
        OrderID: BigInt(input.orderId),
        Comments: input.text.trim(),
        AddedDate: new Date(),
        AddedBy: session.user.name || session.user.loginId,
      },
      select: { ID: true },
    })

    revalidatePath('/admin/orders')
    return { success: true, commentId: String(created.ID) }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to add comment'
    return { success: false, error: message }
  }
}

// ============================================================================
// Rep Assignment
// ============================================================================

/**
 * Update the sales rep assigned to an order.
 * Matches .NET: ddlSalesRep_SelectedIndexChanged
 */
export async function updateOrderRep(input: {
  orderId: string
  repName: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()
    
    await prisma.customerOrders.update({
      where: { ID: BigInt(input.orderId) },
      data: { SalesRep: input.repName.trim() },
    })

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update rep'
    return { success: false, error: message }
  }
}

// ============================================================================
// Buyer Order Creation
// ============================================================================

/**
 * Generate next order number with A (ATS) or P (Pre-Order) prefix.
 * Matches .NET MyOrder.aspx.cs order number generation.
 */
export async function getNextOrderNumber(isPreOrder: boolean): Promise<string> {
  const prefix = isPreOrder ? 'P' : 'A'
  const defaultStart = 10001

  const lastOrder = await prisma.customerOrders.findFirst({
    where: { OrderNumber: { startsWith: prefix } },
    orderBy: { ID: 'desc' },
    select: { OrderNumber: true },
  })

  if (!lastOrder?.OrderNumber) {
    return `${prefix}${defaultStart}`
  }

  const lastNumber = parseInt(lastOrder.OrderNumber.replace(prefix, ''), 10)
  return `${prefix}${lastNumber + 1}`
}

/**
 * Result shape from createOrder action.
 */
export interface CreateOrderResult {
  success: boolean
  orderId?: string
  orderNumber?: string
  error?: string
}

/**
 * Create a new order from buyer cart submission.
 * Matches .NET MyOrder.aspx.cs btnSaveOrder_Click behavior:
 * - Creates CustomerOrders header
 * - Creates CustomerOrdersItems for each line
 * - Upserts Customer record with address
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  try {
    // Validate input server-side
    const parsed = createOrderInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }
    }

    const data = parsed.data

    // Generate order number
    const orderNumber = await getNextOrderNumber(data.isPreOrder)

    // Calculate total
    const orderAmount = data.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

    // Create order and items in transaction
    const order = await prisma.$transaction(async (tx) => {
      // Create order header
      const newOrder = await tx.customerOrders.create({
        data: {
          OrderNumber: orderNumber,
          BuyerName: data.buyerName,
          StoreName: data.storeName,
          SalesRep: data.salesRep,
          CustomerEmail: data.customerEmail,
          CustomerPhone: data.customerPhone,
          Country: data.currency, // Legacy: stores currency, not country
          OrderAmount: orderAmount,
          OrderNotes: data.orderNotes ?? '',
          CustomerPO: data.customerPO ?? '',
          ShipStartDate: new Date(data.shipStartDate),
          ShipEndDate: new Date(data.shipEndDate),
          OrderDate: new Date(),
          Website: data.website ?? '',
          IsShipped: false,
          OrderStatus: 'Pending',
          IsTransferredToShopify: false,
        },
      })

      // Create line items
      await tx.customerOrdersItems.createMany({
        data: data.items.map((item) => ({
          CustomerOrderID: newOrder.ID,
          OrderNumber: orderNumber,
          SKU: item.sku,
          SKUVariantID: BigInt(item.skuVariantId),
          Quantity: item.quantity,
          Price: item.price,
          PriceCurrency: data.currency,
          Notes: '',
        })),
      })

      // Find or create customer (StoreName is not unique in DB, so use findFirst)
      const existingCustomer = await tx.customers.findFirst({
        where: { StoreName: data.storeName },
        select: { ID: true, OrderCount: true },
      })

      if (existingCustomer) {
        await tx.customers.update({
          where: { ID: existingCustomer.ID },
          data: {
            CustomerName: data.buyerName,
            Email: data.customerEmail,
            Phone: data.customerPhone,
            Rep: data.salesRep,
            Street1: data.street1,
            Street2: data.street2 ?? '',
            City: data.city,
            StateProvince: data.stateProvince,
            ZipPostal: data.zipPostal,
            Country: data.country,
            ShippingStreet1: data.shippingStreet1,
            ShippingStreet2: data.shippingStreet2 ?? '',
            ShippingCity: data.shippingCity,
            ShippingStateProvince: data.shippingStateProvince,
            ShippingZipPostal: data.shippingZipPostal,
            ShippingCountry: data.shippingCountry,
            Website: data.website ?? '',
            LastOrderDate: new Date(),
            OrderCount: (existingCustomer.OrderCount ?? 0) + 1,
          },
        })
      } else {
        await tx.customers.create({
          data: {
            StoreName: data.storeName,
            CustomerName: data.buyerName,
            Email: data.customerEmail,
            Phone: data.customerPhone,
            Rep: data.salesRep,
            Street1: data.street1,
            Street2: data.street2 ?? '',
            City: data.city,
            StateProvince: data.stateProvince,
            ZipPostal: data.zipPostal,
            Country: data.country,
            ShippingStreet1: data.shippingStreet1,
            ShippingStreet2: data.shippingStreet2 ?? '',
            ShippingCity: data.shippingCity,
            ShippingStateProvince: data.shippingStateProvince,
            ShippingZipPostal: data.shippingZipPostal,
            ShippingCountry: data.shippingCountry,
            Website: data.website ?? '',
            FirstOrderDate: new Date(),
            LastOrderDate: new Date(),
            OrderCount: 1,
          },
        })
      }

      return newOrder
    })

    revalidatePath('/admin/orders')

    return {
      success: true,
      orderId: order.ID.toString(),
      orderNumber: orderNumber,
    }
  } catch (e) {
    console.error('createOrder error:', e)
    const message = e instanceof Error ? e.message : 'Failed to create order'
    return { success: false, error: message }
  }
}

// ============================================================================
// Stub Actions (Defer to later briefs)
// ============================================================================

/**
 * Duplicate an existing order.
 * STUB: Requires .NET port of CreateDuplicateOrder logic.
 * 
 * .NET Reference: CustomersOrders.aspx.cs CreateDuplicateOrder()
 * - Creates new order with same customer info
 * - Copies all line items
 * - Generates new order number (A or P prefix based on isATS)
 */
export async function duplicateOrder(_input: {
  orderId: string
}): Promise<{ success: boolean; newOrderId?: string; error?: string }> {
  return { 
    success: false, 
    error: 'Not implemented. Requires .NET port (CreateDuplicateOrder).' 
  }
}

/**
 * Transfer order to Shopify.
 * 
 * .NET Reference: CustomersOrders.aspx.cs TransferOrderToShopify() (370+ lines)
 * - Check/create customer in Shopify
 * - Create order in Shopify
 * - Handle missing line items (SKUs not in Shopify)
 * - Update customer address if changed
 * - Set IsTransferredToShopify = true on success
 * 
 * Implementation in src/lib/data/actions/shopify.ts
 */
import { transferOrderToShopify as _transferOrderToShopify } from './shopify'

export async function transferOrderToShopify(input: {
  orderId: string
}): Promise<{ 
  success: boolean
  shopifyOrderId?: string
  missingSkus?: string[]
  error?: string 
}> {
  return _transferOrderToShopify(input.orderId)
}
