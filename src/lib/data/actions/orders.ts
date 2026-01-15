'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import type { OrderStatus, CreateOrderResult, UpdateOrderInput, UpdateOrderResult } from '@/lib/types/order'
import { createOrderInputSchema, type CreateOrderInput } from '@/lib/schemas/order'
import { sendOrderEmails } from '@/lib/email/send-order-emails'

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
// Order Details (Payment Terms, Approval Date, Brand Notes)
// ============================================================================

/**
 * Update order details for PDF (Payment Terms, Approval Date, Brand Notes).
 * These fields are used in the NuORDER-style PDF export.
 */
export async function updateOrderDetails(input: {
  orderId: string
  paymentTerms?: string
  approvalDate?: string | null
  brandNotes?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()

    // Build update data - only include provided fields
    const data: {
      PaymentTerms?: string
      ApprovalDate?: Date | null
      BrandNotes?: string
    } = {}

    if (input.paymentTerms !== undefined) {
      data.PaymentTerms = input.paymentTerms.trim()
    }
    if (input.approvalDate !== undefined) {
      data.ApprovalDate = input.approvalDate ? new Date(input.approvalDate) : null
    }
    if (input.brandNotes !== undefined) {
      data.BrandNotes = input.brandNotes.trim()
    }

    await prisma.customerOrders.update({
      where: { ID: BigInt(input.orderId) },
      data,
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${input.orderId}`)
    return { success: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update order details'
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
 * Uses atomic stored procedure to prevent race conditions.
 * 
 * Matches .NET MyOrder.aspx.cs format: A{number} or P{number}
 */
export async function getNextOrderNumber(isPreOrder: boolean): Promise<string> {
  const prefix = isPreOrder ? 'P' : 'A'

  try {
    // Use atomic stored procedure for concurrency safety
    const result = await prisma.$queryRaw<[{ OrderNumber: string }]>`
      DECLARE @OrderNumber NVARCHAR(50);
      EXEC [dbo].[uspGetNextOrderNumber] @Prefix = ${prefix}, @OrderNumber = @OrderNumber OUTPUT;
      SELECT @OrderNumber AS OrderNumber;
    `
    
    if (result?.[0]?.OrderNumber) {
      return result[0].OrderNumber
    }
    
    // Fallback if SP not available (e.g., migration not run yet)
    return getNextOrderNumberFallback(prefix)
  } catch (error) {
    // Fallback to legacy method if SP doesn't exist
    console.warn('Order number SP not available, using fallback:', error)
    return getNextOrderNumberFallback(prefix)
  }
}

/**
 * Fallback order number generation (legacy method).
 * WARNING: Has race condition - only use if SP is unavailable.
 */
async function getNextOrderNumberFallback(prefix: string): Promise<string> {
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
    const result = await prisma.$transaction(async (tx) => {
      // Look up rep by ID - fail if not found
      const rep = await tx.reps.findUnique({
        where: { ID: parseInt(data.salesRepId) },
        select: { Name: true, Code: true },
      })
      if (!rep) {
        throw new Error('Invalid sales rep')
      }
      // NAME for CustomerOrders.SalesRep, CODE (with fallback) for Customers.Rep
      const salesRepName = rep.Name ?? ''
      const salesRepCode = rep.Code?.trim() || rep.Name || ''

      // Determine customerId for strong ownership
      // If provided from form (existing customer selected), use it
      // Otherwise, look up by StoreName (may be null for new stores)
      let customerId: number | null = data.customerId ?? null
      if (!customerId) {
        const existingByName = await tx.customers.findFirst({
          where: { StoreName: data.storeName },
          select: { ID: true },
        })
        if (existingByName) {
          customerId = existingByName.ID
        }
      }

      // Create order header with RepID and CustomerID for strong ownership
      const newOrder = await tx.customerOrders.create({
        data: {
          OrderNumber: orderNumber,
          BuyerName: data.buyerName,
          StoreName: data.storeName,
          SalesRep: salesRepName,
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
          IsPreOrder: data.isPreOrder,
          // Strong ownership fields - enables resilient rep filtering
          RepID: parseInt(data.salesRepId),
          CustomerID: customerId, // May be null for new customers initially
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
            Rep: salesRepCode,
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
        // Create new customer and update order with CustomerID
        const newCustomer = await tx.customers.create({
          data: {
            StoreName: data.storeName,
            CustomerName: data.buyerName,
            Email: data.customerEmail,
            Phone: data.customerPhone,
            Rep: salesRepCode,
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
          select: { ID: true },
        })

        // Update order with new customer's ID for strong ownership
        await tx.customerOrders.update({
          where: { ID: newOrder.ID },
          data: { CustomerID: newCustomer.ID },
        })
      }

      return { order: newOrder, salesRepName }
    })

    // Send order confirmation emails (non-blocking)
    // Matches .NET behavior: emails sent after order creation, errors don't fail order
    sendOrderEmails({
      orderId: result.order.ID.toString(),
      orderNumber: orderNumber,
      storeName: data.storeName,
      buyerName: data.buyerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      salesRep: result.salesRepName,
      orderAmount: orderAmount,
      currency: data.currency,
      shipStartDate: new Date(data.shipStartDate),
      shipEndDate: new Date(data.shipEndDate),
      orderDate: new Date(),
      orderNotes: data.orderNotes,
      customerPO: data.customerPO,
      items: data.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        lineTotal: item.price * item.quantity,
      })),
    }).catch((err) => {
      // Log email errors but don't fail the order
      console.error('Order email error:', err)
    })

    revalidatePath('/admin/orders')

    return {
      success: true,
      orderId: result.order.ID.toString(),
      orderNumber: orderNumber,
    }
  } catch (e) {
    console.error('createOrder error:', e)
    const message = e instanceof Error ? e.message : 'Failed to create order'
    return { success: false, error: message }
  }
}

// ============================================================================
// Order Update (Edit Items)
// ============================================================================

/**
 * Update an existing order.
 * Matches .NET MyOrder.aspx.cs behavior for edit mode:
 * - Updates CustomerOrders header
 * - Deletes old items, inserts new items
 * - Recalculates order amount
 *
 * @param input - Order update data
 * @returns Success status with order number
 */
export async function updateOrder(
  input: UpdateOrderInput
): Promise<UpdateOrderResult> {
  try {
    const { orderId, items, ...headerData } = input

    // Verify order exists and is editable
    const existingOrder = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        OrderNumber: true,
        OrderStatus: true,
        IsTransferredToShopify: true,
      },
    })

    if (!existingOrder) {
      return { success: false, error: 'Order not found' }
    }

    // Check edit conditions: Pending AND NOT in Shopify
    if (existingOrder.OrderStatus !== 'Pending') {
      return { success: false, error: 'Only Pending orders can be edited' }
    }

    if (existingOrder.IsTransferredToShopify) {
      return {
        success: false,
        error: 'Orders transferred to Shopify cannot be edited',
      }
    }

    // Calculate new total
    const orderAmount = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

    // Update order in transaction
    await prisma.$transaction(async (tx) => {
      // Look up rep by ID
      const rep = await tx.reps.findUnique({
        where: { ID: parseInt(headerData.salesRepId) },
        select: { Name: true },
      })
      if (!rep) {
        throw new Error('Invalid sales rep')
      }
      const salesRepName = rep.Name ?? ''

      // Update order header
      await tx.customerOrders.update({
        where: { ID: BigInt(orderId) },
        data: {
          StoreName: headerData.storeName,
          BuyerName: headerData.buyerName,
          SalesRep: salesRepName,
          CustomerEmail: headerData.customerEmail,
          CustomerPhone: headerData.customerPhone,
          Country: headerData.currency, // Legacy: stores currency
          OrderAmount: orderAmount,
          OrderNotes: headerData.orderNotes ?? '',
          CustomerPO: headerData.customerPO ?? '',
          ShipStartDate: new Date(headerData.shipStartDate),
          ShipEndDate: new Date(headerData.shipEndDate),
          Website: headerData.website ?? '',
        },
      })

      // Delete old items
      await tx.customerOrdersItems.deleteMany({
        where: { CustomerOrderID: BigInt(orderId) },
      })

      // Insert new items
      await tx.customerOrdersItems.createMany({
        data: items.map((item) => ({
          CustomerOrderID: BigInt(orderId),
          OrderNumber: existingOrder.OrderNumber,
          SKU: item.sku,
          SKUVariantID: BigInt(item.skuVariantId),
          Quantity: item.quantity,
          Price: item.price,
          PriceCurrency: headerData.currency,
          Notes: '',
        })),
      })
    })

    revalidatePath('/admin/orders')
    revalidatePath('/rep/orders')

    // Look up the rep name for email
    const repForEmail = await prisma.reps.findUnique({
      where: { ID: parseInt(headerData.salesRepId) },
      select: { Name: true },
    })
    const salesRepName = repForEmail?.Name ?? ''

    // Send update notification emails (async, non-blocking)
    // Email settings control whether update notifications are actually sent
    const currency = headerData.currency.toUpperCase().includes('CAD') ? 'CAD' : 'USD' as 'CAD' | 'USD'
    sendOrderEmails(
      {
        orderId: orderId,
        orderNumber: existingOrder.OrderNumber,
        storeName: headerData.storeName,
        buyerName: headerData.buyerName,
        customerEmail: headerData.customerEmail,
        customerPhone: headerData.customerPhone,
        salesRep: salesRepName,
        orderAmount: orderAmount,
        currency: currency,
        shipStartDate: new Date(headerData.shipStartDate),
        shipEndDate: new Date(headerData.shipEndDate),
        orderDate: new Date(), // Use current date for updates
        orderNotes: headerData.orderNotes ?? '',
        customerPO: headerData.customerPO ?? '',
        items: items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
          lineTotal: item.price * item.quantity,
        })),
      },
      true // isUpdate = true
    ).catch((err) => {
      console.error('Failed to send order update emails:', err)
    })

    return {
      success: true,
      orderNumber: existingOrder.OrderNumber,
    }
  } catch (e) {
    console.error('updateOrder error:', e)
    const message = e instanceof Error ? e.message : 'Failed to update order'
    return { success: false, error: message }
  }
}

// ============================================================================
// Order Currency Update
// ============================================================================

/**
 * Update an order's currency and recalculate all item prices.
 * Used for immediate currency toggle in edit mode.
 */
export async function updateOrderCurrency(input: {
  orderId: string
  currency: 'USD' | 'CAD'
}): Promise<{ success: boolean; newTotal?: number; error?: string }> {
  try {
    const { orderId, currency } = input

    // Verify order exists and is editable
    const existingOrder = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        OrderStatus: true,
        IsTransferredToShopify: true,
      },
    })

    if (!existingOrder) {
      return { success: false, error: 'Order not found' }
    }

    if (existingOrder.OrderStatus !== 'Pending') {
      return { success: false, error: 'Only Pending orders can be edited' }
    }

    if (existingOrder.IsTransferredToShopify) {
      return { success: false, error: 'Orders transferred to Shopify cannot be edited' }
    }

    // Get all order items with their SKU IDs
    const items = await prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
      select: {
        ID: true,
        SKU: true,
        Quantity: true,
      },
    })

    // Get the price for each SKU in the new currency
    const skuIds = items.map((item) => item.SKU)
    const skus = await prisma.sku.findMany({
      where: { SkuID: { in: skuIds } },
      select: {
        SkuID: true,
        PriceCAD: true,
        PriceUSD: true,
      },
    })

    const skuPriceMap = new Map(
      skus.map((s) => [
        s.SkuID,
        currency === 'CAD' ? parseFloat(s.PriceCAD || '0') : parseFloat(s.PriceUSD || '0'),
      ])
    )

    // Update in transaction
    let newTotal = 0
    await prisma.$transaction(async (tx) => {
      // Update each item's price and currency
      for (const item of items) {
        const newPrice = skuPriceMap.get(item.SKU) ?? 0
        newTotal += newPrice * (item.Quantity ?? 0)

        await tx.customerOrdersItems.update({
          where: { ID: item.ID },
          data: {
            Price: newPrice,
            PriceCurrency: currency,
          },
        })
      }

      // Update order header
      await tx.customerOrders.update({
        where: { ID: BigInt(orderId) },
        data: {
          Country: currency, // Legacy field stores currency
          OrderAmount: newTotal,
        },
      })
    })

    revalidatePath('/admin/orders')
    revalidatePath('/rep/orders')

    return { success: true, newTotal }
  } catch (e) {
    console.error('updateOrderCurrency error:', e)
    const message = e instanceof Error ? e.message : 'Failed to update currency'
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
export async function duplicateOrder(_: {
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
