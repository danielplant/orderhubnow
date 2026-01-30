'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import type { OrderStatus, CreateOrderResult, UpdateOrderInput, UpdateOrderResult } from '@/lib/types/order'
import { createOrderInputSchema, type CreateOrderInput, type PlannedShipmentData } from '@/lib/schemas/order'
import { sendOrderEmails } from '@/lib/email/send-order-emails'
import { validateShipDates, getATSDefaultDates } from '@/lib/validation/ship-window'

// ============================================================================
// Auth Helpers
// ============================================================================

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  return session
}

/**
 * Block mutation if user is admin in view-as mode.
 * Admins viewing as reps should not be able to create/modify orders.
 * The x-url header is set by middleware with the current URL.
 */
async function blockIfAdminViewAs(): Promise<{ blocked: true; error: string } | { blocked: false }> {
  const session = await auth()

  // If not authenticated or not admin, allow through
  if (!session?.user || session.user.role !== 'admin') {
    return { blocked: false }
  }

  // Admin is authenticated - check for view-as mode via x-url header
  const headersList = await headers()
  const currentUrl = headersList.get('x-url') || ''

  try {
    const url = new URL(currentUrl, 'http://localhost')
    const adminViewAs = url.searchParams.get('adminViewAs')

    if (adminViewAs) {
      return { blocked: true, error: 'Order modifications are disabled in view-as mode' }
    }
  } catch {
    // URL parsing failed, continue
  }

  // Admin without explicit view-as param - allow through
  // (page-level checks handle preventing admin access to buyer flow)
  return { blocked: false }
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

// ============================================================================
// Planned Shipment Helpers (Phase 3)
// ============================================================================

/**
 * Calculate legacy ship dates from planned shipments.
 * Order header gets earliest start and latest end.
 */
function getLegacyDatesFromShipments(
  plannedShipments: PlannedShipmentData[] | undefined,
  formDates: { shipStartDate: string; shipEndDate: string }
): { start: Date; end: Date } {
  if (!plannedShipments?.length) {
    return {
      start: new Date(formDates.shipStartDate),
      end: new Date(formDates.shipEndDate),
    }
  }

  const starts = plannedShipments.map((s) => new Date(s.plannedShipStart))
  const ends = plannedShipments.map((s) => new Date(s.plannedShipEnd))

  return {
    start: new Date(Math.min(...starts.map((d) => d.getTime()))),
    end: new Date(Math.max(...ends.map((d) => d.getTime()))),
  }
}

/**
 * Find which planned shipment a SKU belongs to.
 */
function findShipmentIdForSku(
  sku: string,
  plannedShipments: PlannedShipmentData[] | undefined,
  shipmentIdMap: Map<string, bigint>
): bigint | null {
  if (!plannedShipments?.length) return null
  const shipment = plannedShipments.find((s) => s.itemSkus.includes(sku))
  return shipment ? (shipmentIdMap.get(shipment.id) ?? null) : null
}

/**
 * Derive planned shipments when client doesn't send them.
 * Backward compatibility for old clients.
 */
function deriveShipmentsFromItems(
  items: CreateOrderInput['items'],
  formDates: { shipStartDate: string; shipEndDate: string }
): PlannedShipmentData[] {
  const atsDefaults = getATSDefaultDates()
  const groups = new Map<string, typeof items>()

  for (const item of items) {
    const key = item.collectionId?.toString() ?? 'no-collection'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  return Array.from(groups.entries()).map(([, groupItems], index) => ({
    id: `derived-${index}`,
    collectionId: groupItems[0].collectionId ?? null,
    collectionName: groupItems[0].collectionName ?? null,
    itemSkus: groupItems.map((i) => i.sku),
    plannedShipStart: groupItems[0].shipWindowStart ?? formDates.shipStartDate ?? atsDefaults.start,
    plannedShipEnd: groupItems[0].shipWindowEnd ?? formDates.shipEndDate ?? atsDefaults.end,
  }))
}

/**
 * Create a new order from buyer cart submission.
 * 
 * Phase 3: Creates ONE order with multiple PlannedShipments.
 * Previously split orders by collection - now creates a single order
 * and groups items into PlannedShipment records by collection.
 * 
 * Matches .NET MyOrder.aspx.cs btnSaveOrder_Click behavior:
 * - Creates CustomerOrders header
 * - Creates CustomerOrdersItems for each line
 * - Creates PlannedShipments for each collection group
 * - Upserts Customer record with address
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  try {
    // Block if admin is in view-as mode
    const viewAsCheck = await blockIfAdminViewAs()
    if (viewAsCheck.blocked) {
      return { success: false, error: viewAsCheck.error }
    }

    // Validate input server-side
    const parsed = createOrderInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }
    }

    const data = parsed.data

    // Derive order type from SKU data (master source: Collection.type)
    const skuVariantIds = data.items.map((item) => BigInt(item.skuVariantId))
    const skuPreOrderMap = await deriveIsPreOrderFromSkus(skuVariantIds)

    // Determine order type: PreOrder if ANY item is PreOrder (P-prefix wins)
    const isPreOrder = Array.from(skuPreOrderMap.values()).some((v) => v)

    // Use provided plannedShipments or derive from items (backward compat)
    const plannedShipments = data.plannedShipments?.length
      ? data.plannedShipments
      : deriveShipmentsFromItems(data.items, {
          shipStartDate: data.shipStartDate,
          shipEndDate: data.shipEndDate,
        })

    // =========================================================================
    // Server-side validation: Batch fetch collections and validate dates
    // =========================================================================
    const collectionIds = plannedShipments
      .map((s) => s.collectionId)
      .filter((id): id is number => id !== null)

    const collections = collectionIds.length > 0
      ? await prisma.collection.findMany({
          where: { id: { in: collectionIds } },
          select: { id: true, name: true, shipWindowStart: true, shipWindowEnd: true },
        })
      : []

    const collectionMap = new Map(collections.map((c) => [c.id, c]))

    // Validate each shipment's dates against collection window
    for (const shipment of plannedShipments) {
      if (shipment.collectionId) {
        const collection = collectionMap.get(shipment.collectionId)
        if (collection?.shipWindowStart && collection?.shipWindowEnd) {
          const result = validateShipDates(
            shipment.plannedShipStart,
            shipment.plannedShipEnd,
            [{
              id: shipment.collectionId,
              name: collection.name,
              shipWindowStart: collection.shipWindowStart.toISOString(),
              shipWindowEnd: collection.shipWindowEnd.toISOString(),
            }]
          )
          if (!result.valid) {
            return {
              success: false,
              error: `Invalid dates for ${collection.name}: ${result.errors[0]?.message}`,
            }
          }
        }
      }
    }

    // =========================================================================
    // Calculate order totals and legacy dates
    // =========================================================================
    const orderAmount = data.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

    const legacyDates = getLegacyDatesFromShipments(plannedShipments, {
      shipStartDate: data.shipStartDate,
      shipEndDate: data.shipEndDate,
    })

    // Track created order and shipments
    let orderId: bigint = BigInt(0)
    let orderNumber: string = ''
    const createdShipmentIds: string[] = []

    // =========================================================================
    // Create order in a single transaction
    // =========================================================================
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

      // Generate SINGLE order number
      orderNumber = await getNextOrderNumber(isPreOrder)

      // CREATE SINGLE ORDER
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
          ShipStartDate: legacyDates.start, // Earliest across all shipments
          ShipEndDate: legacyDates.end,     // Latest across all shipments
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
      orderId = newOrder.ID

      // CREATE PLANNED SHIPMENTS
      const shipmentIdMap = new Map<string, bigint>()

      for (const shipment of plannedShipments) {
        const created = await tx.plannedShipment.create({
          data: {
            CustomerOrderID: newOrder.ID,
            CollectionID: shipment.collectionId,
            CollectionName: shipment.collectionName,
            PlannedShipStart: new Date(shipment.plannedShipStart),
            PlannedShipEnd: new Date(shipment.plannedShipEnd),
            Status: 'Planned',
          },
        })
        shipmentIdMap.set(shipment.id, created.ID)
        createdShipmentIds.push(created.ID.toString())
      }

      // CREATE ALL ORDER ITEMS with PlannedShipmentID
      for (const item of data.items) {
        const plannedShipmentId = findShipmentIdForSku(
          item.sku,
          plannedShipments,
          shipmentIdMap
        )

        await tx.customerOrdersItems.create({
          data: {
            CustomerOrderID: newOrder.ID,
            OrderNumber: orderNumber,
            SKU: item.sku,
            SKUVariantID: BigInt(item.skuVariantId),
            Quantity: item.quantity,
            Price: item.price,
            PriceCurrency: data.currency,
            PlannedShipmentID: plannedShipmentId, // Link to planned shipment
            Notes: '',
          },
        })
      }

      // Find or create customer
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
            OrderCount: (existingCustomer.OrderCount ?? 0) + 1, // Single order
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
            OrderCount: 1, // Single order
          },
          select: { ID: true },
        })

        // Update order with new customer's ID
        await tx.customerOrders.update({
          where: { ID: newOrder.ID },
          data: { CustomerID: newCustomer.ID },
        })
      }
    })

    // =========================================================================
    // Send order confirmation emails (non-blocking)
    // =========================================================================
    if (!data.skipEmail) {
      // Look up rep name and email for the order emails
      const rep = await prisma.reps.findUnique({
        where: { ID: parseInt(data.salesRepId) },
        select: { Name: true, Email1: true, Email2: true },
      })
      const salesRepName = rep?.Name || ''
      const salesRepEmail = rep?.Email1 || rep?.Email2 || undefined

      // Send email for the single order
      sendOrderEmails({
        orderId: orderId.toString(),
        orderNumber,
        storeName: data.storeName,
        buyerName: data.buyerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        salesRep: salesRepName,
        salesRepEmail,
        orderAmount,
        currency: data.currency,
        shipStartDate: legacyDates.start,
        shipEndDate: legacyDates.end,
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
        console.error(`Order email error for ${orderNumber}:`, err)
      })
    }

    revalidatePath('/admin/orders')

    // Return single order with backward-compatible orders[] array
    return {
      success: true,
      orderId: orderId.toString(),
      orderNumber,
      plannedShipmentCount: createdShipmentIds.length,
      // Backward compat: single-item array for consumers expecting orders[]
      orders: [{
        orderId: orderId.toString(),
        orderNumber,
        collectionName: null, // Deprecated - multiple collections now
        shipWindowStart: legacyDates.start.toISOString(),
        shipWindowEnd: legacyDates.end.toISOString(),
        orderAmount,
      }],
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
    // Block if admin is in view-as mode
    const viewAsCheck = await blockIfAdminViewAs()
    if (viewAsCheck.blocked) {
      return { success: false, error: viewAsCheck.error }
    }

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

      // Phase 5: Sync PlannedShipments BEFORE deleting items
      // This is critical - items are recreated, so we need shipment IDs first
      const shipmentIdMap = new Map<string, bigint>()
      const referencedIds = new Set<string>()

      // 1. Get existing PlannedShipments
      const existingShipments = await tx.plannedShipment.findMany({
        where: { CustomerOrderID: BigInt(orderId) },
        select: { ID: true },
      })
      const existingIds = new Set(existingShipments.map((s) => String(s.ID)))

      // 2. Validate and sync shipments if provided
      if (input.plannedShipments && input.plannedShipments.length > 0) {
        // Fetch collection windows for validation
        const collectionIds = input.plannedShipments
          .map((s) => s.collectionId)
          .filter((id): id is number => id !== null)

        const collections = collectionIds.length > 0
          ? await tx.collection.findMany({
              where: { id: { in: collectionIds } },
              select: {
                id: true,
                name: true,
                shipWindowStart: true,
                shipWindowEnd: true,
              },
            })
          : []

        const collectionMap = new Map(collections.map((c) => [c.id, c]))

        // Validate each shipment's dates against collection windows
        for (const shipment of input.plannedShipments) {
          if (shipment.collectionId) {
            const collection = collectionMap.get(shipment.collectionId)
            if (collection) {
              const result = validateShipDates(
                shipment.plannedShipStart,
                shipment.plannedShipEnd,
                [
                  {
                    id: collection.id,
                    name: collection.name ?? '',
                    shipWindowStart:
                      collection.shipWindowStart?.toISOString().slice(0, 10) ?? null,
                    shipWindowEnd:
                      collection.shipWindowEnd?.toISOString().slice(0, 10) ?? null,
                  },
                ]
              )
              if (!result.valid) {
                throw new Error(
                  `Invalid ship dates for ${collection.name}: ${result.errors[0]?.message}`
                )
              }
            }
          }
        }

        // 3. Create new shipments first (to get real IDs)
        for (const shipment of input.plannedShipments) {
          if (shipment.id.startsWith('new-')) {
            const newShipment = await tx.plannedShipment.create({
              data: {
                CustomerOrderID: BigInt(orderId),
                CollectionID: shipment.collectionId,
                CollectionName: shipment.collectionName,
                PlannedShipStart: new Date(shipment.plannedShipStart),
                PlannedShipEnd: new Date(shipment.plannedShipEnd),
                Status: 'Planned',
              },
            })
            shipmentIdMap.set(shipment.id, newShipment.ID)
          } else {
            // Update existing shipment
            referencedIds.add(shipment.id)
            shipmentIdMap.set(shipment.id, BigInt(shipment.id))

            await tx.plannedShipment.update({
              where: { ID: BigInt(shipment.id) },
              data: {
                PlannedShipStart: new Date(shipment.plannedShipStart),
                PlannedShipEnd: new Date(shipment.plannedShipEnd),
              },
            })
          }
        }
      }

      // 4. Delete old items
      await tx.customerOrdersItems.deleteMany({
        where: { CustomerOrderID: BigInt(orderId) },
      })

      // 5. Create new items WITH PlannedShipmentID
      await tx.customerOrdersItems.createMany({
        data: items.map((item) => {
          // Find which shipment this item belongs to
          const shipment = input.plannedShipments?.find((s) =>
            s.itemSkus.includes(item.sku)
          )
          const plannedShipmentId = shipment
            ? shipmentIdMap.get(shipment.id) ?? null
            : null

          return {
            CustomerOrderID: BigInt(orderId),
            OrderNumber: existingOrder.OrderNumber,
            SKU: item.sku,
            SKUVariantID: BigInt(item.skuVariantId),
            Quantity: item.quantity,
            Price: item.price,
            PriceCurrency: headerData.currency,
            Notes: '',
            PlannedShipmentID: plannedShipmentId,
          }
        }),
      })

      // 6. Delete orphaned shipments (no longer referenced)
      const orphanedIds = [...existingIds].filter((id) => !referencedIds.has(id))
      if (orphanedIds.length > 0) {
        await tx.plannedShipment.deleteMany({
          where: { ID: { in: orphanedIds.map((id) => BigInt(id)) } },
        })
      }

      // 7. Update order header
      // Phase 5: Recalculate dates from shipments if they exist
      let finalShipStart = new Date(headerData.shipStartDate)
      let finalShipEnd = new Date(headerData.shipEndDate)

      if (input.plannedShipments && input.plannedShipments.length > 0) {
        const starts = input.plannedShipments.map(
          (s) => new Date(s.plannedShipStart).getTime()
        )
        const ends = input.plannedShipments.map(
          (s) => new Date(s.plannedShipEnd).getTime()
        )
        finalShipStart = new Date(Math.min(...starts))
        finalShipEnd = new Date(Math.max(...ends))
      }

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
          ShipStartDate: finalShipStart,
          ShipEndDate: finalShipEnd,
          Website: headerData.website ?? '',
        },
      })
    })

    revalidatePath('/admin/orders')
    revalidatePath('/rep/orders')

    // Look up the rep name and email for email
    const repForEmail = await prisma.reps.findUnique({
      where: { ID: parseInt(headerData.salesRepId) },
      select: { Name: true, Email1: true, Email2: true },
    })
    const salesRepName = repForEmail?.Name ?? ''
    const salesRepEmail = repForEmail?.Email1 || repForEmail?.Email2 || undefined

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
        salesRepEmail,
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
