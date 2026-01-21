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

/**
 * Update order notes (for variance explanations, shipping notes, etc.).
 * Uses the BrandNotes field in the database.
 */
export async function updateOrderNotes(input: {
  orderId: string
  notes: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()

    await prisma.customerOrders.update({
      where: { ID: BigInt(input.orderId) },
      data: { BrandNotes: input.notes.trim() || null },
    })

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update notes'
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
 * Get grouping key for an order item based on ship window/category.
 * Used to split orders by delivery date/collection.
 */
function getShipWindowKey(item: {
  categoryId?: number | null
  shipWindowStart?: string | null
  shipWindowEnd?: string | null
}): string {
  // Group by categoryId first (most specific - matches business labels like "FW26 Core1")
  if (item.categoryId) {
    return `cat-${item.categoryId}`
  }
  // Fallback to ship window dates
  if (item.shipWindowStart || item.shipWindowEnd) {
    return `window-${item.shipWindowStart || 'none'}-${item.shipWindowEnd || 'none'}`
  }
  // Default group for items without metadata
  return 'default'
}

/**
 * Derive order type (ATS vs Pre-Order) from SKU data.
 * Master source: SkuCategories.IsPreOrder
 * 
 * Returns a map of SKU variant ID -> isPreOrder boolean.
 * Used to split orders when cart contains mixed ATS and Pre-Order items.
 */
async function deriveIsPreOrderFromSkus(
  skuVariantIds: bigint[]
): Promise<Map<string, boolean>> {
  if (skuVariantIds.length === 0) {
    return new Map()
  }

  // Query SKUs with their Collection type (source of truth for pre-order status)
  // Note: skuVariantIds are ShopifyProductVariantId values, not Sku.ID
  const skus = await prisma.sku.findMany({
    where: { ShopifyProductVariantId: { in: skuVariantIds } },
    select: {
      ShopifyProductVariantId: true,
      CollectionID: true,
      Collection: {
        select: { type: true },
      },
    },
  })

  const result = new Map<string, boolean>()
  for (const sku of skus) {
    // Use Collection.type to determine pre-order status
    // 'PreOrder' = true, 'ATS' or null = false
    const isPreOrder = sku.Collection?.type === 'PreOrder'
    result.set(String(sku.ShopifyProductVariantId), isPreOrder)
  }

  return result
}

/**
 * Get order grouping key that includes both Collection AND order type.
 * This ensures ATS and Pre-Order items are split into separate orders.
 * 
 * Grouping: CollectionID → default
 * (No CategoryID fallback - Collection is the source of truth)
 */
function getOrderGroupKey(
  item: {
    collectionId?: number | null
    skuVariantId: number | bigint
  },
  skuPreOrderMap: Map<string, boolean>
): string {
  const isPreOrder = skuPreOrderMap.get(String(item.skuVariantId)) ?? false
  const typePrefix = isPreOrder ? 'preorder' : 'ats'
  
  // Group by order type first, then by collection
  if (item.collectionId) {
    return `${typePrefix}-collection-${item.collectionId}`
  }
  return `${typePrefix}-default`
}

/**
 * Create a new order from buyer cart submission.
 * Matches .NET MyOrder.aspx.cs btnSaveOrder_Click behavior:
 * - Creates CustomerOrders header
 * - Creates CustomerOrdersItems for each line
 * - Upserts Customer record with address
 * 
 * NEW: Splits orders by ship window/category when items have different delivery dates.
 * A single cart with multiple ship windows results in multiple OHN orders.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  try {
    // Validate input server-side
    const parsed = createOrderInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }
    }

    const data = parsed.data

    // Derive order type from SKU data (master source: SkuCategories.IsPreOrder)
    const skuVariantIds = data.items.map((item) => BigInt(item.skuVariantId))
    const skuPreOrderMap = await deriveIsPreOrderFromSkus(skuVariantIds)

    // Group items by order type AND ship window (auto-split mixed ATS/Pre-Order)
    const itemGroups = new Map<string, typeof data.items>()
    for (const item of data.items) {
      const key = getOrderGroupKey(item, skuPreOrderMap)
      if (!itemGroups.has(key)) {
        itemGroups.set(key, [])
      }
      itemGroups.get(key)!.push(item)
    }

    // Track created orders
    const createdOrders: Array<{
      orderId: string
      orderNumber: string
      collectionName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
      orderAmount: number
      items: typeof data.items
    }> = []

    // Create orders in a single transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Look up rep by ID - fail if not found
      const rep = await tx.reps.findUnique({
        where: { ID: parseInt(data.salesRepId) },
        select: { Name: true, Code: true },
      })
      if (!rep) {
        throw new Error('Invalid sales rep')
      }
      const salesRepName = rep.Name ?? ''
      const salesRepCode = rep.Code?.trim() || rep.Name || ''

      // Determine customerId for strong ownership
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

      // Create one order per ship window group (and order type)
      for (const [groupKey, groupItems] of itemGroups) {
        // Determine order type from first item's SKU (all items in group have same type)
        const firstItemVariantId = String(groupItems[0].skuVariantId)
        const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false
        
        // Generate order number with appropriate prefix
        const orderNumber = await getNextOrderNumber(isPreOrder)

        // Calculate group total
        const orderAmount = groupItems.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        )

        // Use item's ship window if available, else form dates
        const firstItem = groupItems[0]
        const shipStart = firstItem.shipWindowStart
          ? new Date(firstItem.shipWindowStart)
          : new Date(data.shipStartDate)
        const shipEnd = firstItem.shipWindowEnd
          ? new Date(firstItem.shipWindowEnd)
          : new Date(data.shipEndDate)

        // Create order header
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
            ShipStartDate: shipStart,
            ShipEndDate: shipEnd,
            OrderDate: new Date(),
            Website: data.website ?? '',
            IsShipped: false,
            OrderStatus: 'Pending',
            IsTransferredToShopify: false,
            IsPreOrder: isPreOrder, // Derived from SKU category, not client input
            RepID: parseInt(data.salesRepId),
            CustomerID: customerId,
          },
        })

        // Create line items for this group
        await tx.customerOrdersItems.createMany({
          data: groupItems.map((item) => ({
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

        createdOrders.push({
          orderId: newOrder.ID.toString(),
          orderNumber,
          collectionName: firstItem.collectionName ?? null,
          shipWindowStart: firstItem.shipWindowStart ?? null,
          shipWindowEnd: firstItem.shipWindowEnd ?? null,
          orderAmount,
          items: groupItems,
        })
      }

      // Find or create customer (only once, not per order)
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
            OrderCount: (existingCustomer.OrderCount ?? 0) + createdOrders.length,
          },
        })
      } else {
        // Create new customer and update all orders with CustomerID
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
            OrderCount: createdOrders.length,
          },
          select: { ID: true },
        })

        // Update all created orders with new customer's ID
        for (const order of createdOrders) {
          await tx.customerOrders.update({
            where: { ID: BigInt(order.orderId) },
            data: { CustomerID: newCustomer.ID },
          })
        }
      }
    })

    // Send order confirmation emails (non-blocking) unless skipEmail is set
    // When skipEmail is true, emails are sent via the confirmation popup instead
    if (!data.skipEmail) {
      // Send email for each created order
      for (const order of createdOrders) {
        sendOrderEmails({
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          storeName: data.storeName,
          buyerName: data.buyerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          salesRep: data.storeName, // Will be looked up by email service
          orderAmount: order.orderAmount,
          currency: data.currency,
          shipStartDate: order.shipWindowStart ? new Date(order.shipWindowStart) : new Date(data.shipStartDate),
          shipEndDate: order.shipWindowEnd ? new Date(order.shipWindowEnd) : new Date(data.shipEndDate),
          orderDate: new Date(),
          orderNotes: data.orderNotes,
          customerPO: data.customerPO,
          items: order.items.map((item) => ({
            sku: item.sku,
            quantity: item.quantity,
            price: item.price,
            lineTotal: item.price * item.quantity,
          })),
        }).catch((err) => {
          console.error(`Order email error for ${order.orderNumber}:`, err)
        })
      }
    }

    revalidatePath('/admin/orders')

    // Return first order for backwards compatibility, plus full orders array
    const primaryOrder = createdOrders[0]
    return {
      success: true,
      orderId: primaryOrder?.orderId,
      orderNumber: primaryOrder?.orderNumber,
      orders: createdOrders.map((o) => ({
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        collectionName: o.collectionName,
        shipWindowStart: o.shipWindowStart,
        shipWindowEnd: o.shipWindowEnd,
        orderAmount: o.orderAmount,
      })),
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
export async function duplicateOrder(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _input: { orderId: string }
): Promise<{ success: boolean; newOrderId?: string; error?: string }> {
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
