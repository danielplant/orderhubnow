'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import type { OrderStatus, CreateOrderResult, UpdateOrderInput, UpdateOrderResult, StatusChangeOptions, StatusChangeResult } from '@/lib/types/order'
import { createOrderInputSchema, type CreateOrderInput } from '@/lib/schemas/order'
import { sendOrderEmails } from '@/lib/email/send-order-emails'
import { validateShipDates } from '@/lib/validation/ship-window'
import { shopify } from '@/lib/shopify/client'
import { logOrderStatusChange } from '@/lib/audit/activity-logger'

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
 * Sync a status change to Shopify (cancel or close).
 * Only called for orders that are in Shopify.
 */
async function syncStatusToShopify(
  shopifyOrderId: string,
  oldStatus: OrderStatus,
  newStatus: OrderStatus,
  options?: StatusChangeOptions
): Promise<{ success: boolean; error?: string }> {
  // Cancel: transitioning to Cancelled status
  if (newStatus === 'Cancelled' && oldStatus !== 'Cancelled') {
    const result = await shopify.orders.cancel(shopifyOrderId, {
      reason: options?.cancelReason ?? 'STAFF',
      notifyCustomer: options?.notifyCustomer ?? true,
      restock: options?.restockInventory ?? true,
      staffNote: 'Cancelled from Order Hub',
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true }
  }

  // Close: transitioning to Invoiced status
  if (newStatus === 'Invoiced' && oldStatus !== 'Invoiced') {
    const result = await shopify.orders.close(shopifyOrderId)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true }
  }

  // Other status changes don't need to sync to Shopify
  return { success: true }
}

/**
 * Update a single order's status with optional Shopify sync.
 * 
 * For orders transferred to Shopify:
 * - Cancelled -> calls Shopify orderCancel mutation
 * - Invoiced -> calls Shopify orderClose mutation
 * 
 * Returns sync result so UI can handle success/failure appropriately.
 */
export async function updateOrderStatus(input: {
  orderId: string
  newStatus: OrderStatus
  options?: StatusChangeOptions
}): Promise<StatusChangeResult> {
  try {
    const session = await requireAdmin()
    const performedBy = session?.user?.name || session?.user?.loginId || 'Unknown'

    // Fetch order to check Shopify status and current status
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(input.orderId) },
      select: {
        ID: true,
        OrderNumber: true,
        OrderStatus: true,
        IsTransferredToShopify: true,
        ShopifyOrderID: true,
      },
    })

    if (!order) {
      return { success: false, error: 'Order not found' }
    }

    const oldStatus = order.OrderStatus as OrderStatus

    // Prevent changes to terminal states (Cancelled/Invoiced)
    if (oldStatus === 'Cancelled' || oldStatus === 'Invoiced') {
      return { 
        success: false, 
        error: `Cannot change status of ${oldStatus.toLowerCase()} orders` 
      }
    }

    let shopifySyncResult: StatusChangeResult['shopifySync']

    // Check if this is a Shopify order and sync is needed
    const isShopifyOrder = order.IsTransferredToShopify && order.ShopifyOrderID
    const needsShopifySync = 
      isShopifyOrder && 
      !input.options?.skipShopifySync &&
      (input.newStatus === 'Cancelled' || input.newStatus === 'Invoiced')

    if (needsShopifySync && shopify.isConfigured()) {
      const syncResult = await syncStatusToShopify(
        order.ShopifyOrderID!,
        oldStatus,
        input.newStatus,
        input.options
      )

      shopifySyncResult = {
        attempted: true,
        success: syncResult.success,
        error: syncResult.error,
      }

      // If sync failed, return the error to let UI decide what to do
      // Don't update local status yet - let caller handle it
      if (!syncResult.success) {
        return {
          success: false,
          error: syncResult.error,
          shopifySync: shopifySyncResult,
        }
      }
    } else if (isShopifyOrder && (input.newStatus === 'Cancelled' || input.newStatus === 'Invoiced')) {
      // Shopify order but sync was skipped (user chose to proceed without sync)
      shopifySyncResult = {
        attempted: false,
        success: false,
      }
    }

    // Update local status
    await prisma.customerOrders.update({
      where: { ID: BigInt(input.orderId) },
      data: { OrderStatus: input.newStatus },
    })

    // Log the status change
    await logOrderStatusChange({
      orderId: input.orderId,
      orderNumber: order.OrderNumber,
      oldStatus,
      newStatus: input.newStatus,
      performedBy,
      shopifySync: shopifySyncResult,
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${input.orderId}`)
    
    return { 
      success: true, 
      shopifySync: shopifySyncResult,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update status'
    return { success: false, error: message }
  }
}

/**
 * Bulk update status for multiple orders.
 * 
 * For Cancel/Invoiced on Shopify orders, processes each order individually
 * to sync with Shopify and tracks which succeeded/failed.
 */
export async function bulkUpdateStatus(input: {
  orderIds: string[]
  newStatus: OrderStatus
  options?: StatusChangeOptions
}): Promise<{ 
  success: boolean
  updated: number
  skipped?: number
  shopifyResults?: Array<{ orderId: string; orderNumber: string; synced: boolean; error?: string }>
  error?: string 
}> {
  try {
    const session = await requireAdmin()
    const performedBy = session?.user?.name || session?.user?.loginId || 'Unknown'

    // For Cancel/Invoiced, we need to process Shopify orders individually
    const needsShopifySync = 
      (input.newStatus === 'Cancelled' || input.newStatus === 'Invoiced') && 
      !input.options?.skipShopifySync &&
      shopify.isConfigured()

    if (needsShopifySync) {
      // Fetch orders to check which are in Shopify
      const allOrders = await prisma.customerOrders.findMany({
        where: { ID: { in: input.orderIds.map(id => BigInt(id)) } },
        select: {
          ID: true,
          OrderNumber: true,
          OrderStatus: true,
          IsTransferredToShopify: true,
          ShopifyOrderID: true,
        },
      })

      // Filter out terminal states (Cancelled/Invoiced) - can't update these
      const orders = allOrders.filter(
        o => o.OrderStatus !== 'Cancelled' && o.OrderStatus !== 'Invoiced'
      )
      const skippedTerminal = allOrders.length - orders.length

      const shopifyResults: Array<{ orderId: string; orderNumber: string; synced: boolean; error?: string }> = []
      const successfulIds: bigint[] = []

      for (const order of orders) {
        const oldStatus = order.OrderStatus as OrderStatus

        // If it's a Shopify order, try to sync
        if (order.IsTransferredToShopify && order.ShopifyOrderID) {
          const syncResult = await syncStatusToShopify(
            order.ShopifyOrderID,
            oldStatus,
            input.newStatus,
            input.options
          )
          
          shopifyResults.push({
            orderId: order.ID.toString(),
            orderNumber: order.OrderNumber,
            synced: syncResult.success,
            error: syncResult.error,
          })

          // Only include in local update if Shopify sync succeeded
          if (syncResult.success) {
            successfulIds.push(order.ID)
          }
        } else {
          // Non-Shopify order, always include
          successfulIds.push(order.ID)
        }
      }

      // Update local status for successful orders
      if (successfulIds.length > 0) {
        await prisma.customerOrders.updateMany({
          where: { ID: { in: successfulIds } },
          data: { OrderStatus: input.newStatus },
        })

        // Log each status change
        for (const order of orders.filter(o => successfulIds.includes(o.ID))) {
          await logOrderStatusChange({
            orderId: order.ID.toString(),
            orderNumber: order.OrderNumber,
            oldStatus: order.OrderStatus as string,
            newStatus: input.newStatus,
            performedBy,
            shopifySync: order.IsTransferredToShopify && order.ShopifyOrderID
              ? { attempted: true, success: true }
              : undefined,
          })
        }
      }

      revalidatePath('/admin/orders')
      return { 
        success: true, 
        updated: successfulIds.length,
        skipped: skippedTerminal,
        shopifyResults,
      }
    }

    // For non-Shopify-syncing statuses, update all at once (excluding terminal states)
    const result = await prisma.customerOrders.updateMany({
      where: { 
        ID: { in: input.orderIds.map((id) => BigInt(id)) },
        OrderStatus: { notIn: ['Cancelled', 'Invoiced'] },
      },
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
// Archive/Trash Actions
// ============================================================================

/**
 * Archive orders (only Cancelled/Invoiced).
 * Moves orders out of the active view for long-term storage.
 */
export async function archiveOrders(input: {
  orderIds: string[]
}): Promise<{ success: boolean; archived: number; error?: string }> {
  try {
    const session = await requireAdmin()
    const userName = session.user?.name || session.user?.email || 'Unknown'
    
    // Convert string IDs to BigInt
    const ids = input.orderIds.map(id => BigInt(id))
    
    // Validate: only Cancelled/Invoiced orders can be archived
    const orders = await prisma.customerOrders.findMany({
      where: { ID: { in: ids } },
      select: { ID: true, OrderNumber: true, OrderStatus: true, ArchivedAt: true, TrashedAt: true },
    })
    
    const validOrders = orders.filter(o => 
      (o.OrderStatus === 'Cancelled' || o.OrderStatus === 'Invoiced') &&
      o.ArchivedAt === null &&
      o.TrashedAt === null
    )
    
    if (validOrders.length === 0) {
      return { 
        success: false, 
        archived: 0, 
        error: 'No valid orders to archive. Only active Cancelled or Invoiced orders can be archived.' 
      }
    }
    
    const validIds = validOrders.map(o => o.ID)
    
    // Archive the orders
    const result = await prisma.customerOrders.updateMany({
      where: { ID: { in: validIds } },
      data: {
        ArchivedAt: new Date(),
        ArchivedBy: userName,
      },
    })
    
    revalidatePath('/admin/orders')
    return { success: true, archived: result.count }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to archive orders'
    return { success: false, archived: 0, error: message }
  }
}

/**
 * Restore orders from archive to active.
 */
export async function restoreFromArchive(input: {
  orderIds: string[]
}): Promise<{ success: boolean; restored: number; error?: string }> {
  try {
    await requireAdmin()
    
    const ids = input.orderIds.map(id => BigInt(id))
    
    // Only restore archived orders (not trashed)
    const result = await prisma.customerOrders.updateMany({
      where: { 
        ID: { in: ids },
        ArchivedAt: { not: null },
        TrashedAt: null,
      },
      data: {
        ArchivedAt: null,
        ArchivedBy: null,
      },
    })
    
    revalidatePath('/admin/orders')
    return { success: true, restored: result.count }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to restore orders'
    return { success: false, restored: 0, error: message }
  }
}

/**
 * Move orders to trash. 
 * Shopify orders must be Cancelled/Invoiced first.
 * Orders in trash are auto-deleted after 30 days.
 */
export async function trashOrders(input: {
  orderIds: string[]
}): Promise<{ success: boolean; trashed: number; error?: string }> {
  try {
    const session = await requireAdmin()
    const userName = session.user?.name || session.user?.email || 'Unknown'
    
    const ids = input.orderIds.map(id => BigInt(id))
    
    // Validate: Shopify orders must be Cancelled/Invoiced
    const orders = await prisma.customerOrders.findMany({
      where: { ID: { in: ids } },
      select: { 
        ID: true, 
        OrderNumber: true, 
        OrderStatus: true, 
        IsTransferredToShopify: true,
        TrashedAt: true,
      },
    })
    
    const validOrders = orders.filter(o => {
      // Already trashed? Skip
      if (o.TrashedAt !== null) return false
      
      // Shopify orders must be Cancelled/Invoiced
      if (o.IsTransferredToShopify) {
        return o.OrderStatus === 'Cancelled' || o.OrderStatus === 'Invoiced'
      }
      
      // Non-Shopify orders: all statuses allowed
      return true
    })
    
    if (validOrders.length === 0) {
      return { 
        success: false, 
        trashed: 0, 
        error: 'No valid orders to trash. Shopify orders must be Cancelled or Invoiced first.' 
      }
    }
    
    const validIds = validOrders.map(o => o.ID)
    
    // Move to trash
    const result = await prisma.customerOrders.updateMany({
      where: { ID: { in: validIds } },
      data: {
        TrashedAt: new Date(),
        TrashedBy: userName,
        // Clear archived status if it was archived
        ArchivedAt: null,
        ArchivedBy: null,
      },
    })
    
    revalidatePath('/admin/orders')
    return { success: true, trashed: result.count }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to trash orders'
    return { success: false, trashed: 0, error: message }
  }
}

/**
 * Restore orders from trash to active.
 */
export async function restoreFromTrash(input: {
  orderIds: string[]
}): Promise<{ success: boolean; restored: number; error?: string }> {
  try {
    await requireAdmin()
    
    const ids = input.orderIds.map(id => BigInt(id))
    
    // Only restore trashed orders
    const result = await prisma.customerOrders.updateMany({
      where: { 
        ID: { in: ids },
        TrashedAt: { not: null },
      },
      data: {
        TrashedAt: null,
        TrashedBy: null,
      },
    })
    
    revalidatePath('/admin/orders')
    return { success: true, restored: result.count }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to restore orders'
    return { success: false, restored: 0, error: message }
  }
}

/**
 * Permanently delete orders (only from trash).
 * Deletes related records first (items, comments, shipments).
 */
export async function permanentlyDeleteOrders(input: {
  orderIds: string[]
}): Promise<{ success: boolean; deleted: number; error?: string }> {
  try {
    await requireAdmin()
    
    const ids = input.orderIds.map(id => BigInt(id))
    
    // Only delete orders that are in trash
    const orders = await prisma.customerOrders.findMany({
      where: { 
        ID: { in: ids },
        TrashedAt: { not: null },
      },
      select: { ID: true, OrderNumber: true },
    })
    
    if (orders.length === 0) {
      return { 
        success: false, 
        deleted: 0, 
        error: 'No valid orders to delete. Only trashed orders can be permanently deleted.' 
      }
    }
    
    let deleted = 0
    for (const order of orders) {
      // Delete related records first (no cascade in schema)
      await prisma.customerOrdersItems.deleteMany({ 
        where: { CustomerOrderID: order.ID } 
      })
      await prisma.customerOrdersComments.deleteMany({ 
        where: { OrderID: order.ID } 
      })
      
      // Delete shipment items before shipments
      await prisma.shipmentItems.deleteMany({
        where: { Shipment: { CustomerOrderID: order.ID } }
      })
      await prisma.shipments.deleteMany({ 
        where: { CustomerOrderID: order.ID } 
      })
      
      // PlannedShipments (has cascade from FK but let's be explicit)
      await prisma.plannedShipment.deleteMany({
        where: { CustomerOrderID: order.ID }
      })
      
      // Finally delete the order
      await prisma.customerOrders.delete({ 
        where: { ID: order.ID } 
      })
      
      deleted++
    }
    
    revalidatePath('/admin/orders')
    return { success: true, deleted }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete orders'
    return { success: false, deleted: 0, error: message }
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
    // 'preorder_no_po' or 'preorder_po' = true, 'ats' or null = false
    const collectionType = sku.Collection?.type
    const isPreOrder = collectionType === 'preorder_no_po' || collectionType === 'preorder_po'
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
function _getOrderGroupKey(
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
 *
 * Splits cart items into separate orders by collection (one order per collection).
 * Each order gets the ship window dates from its collection.
 *
 * Matches .NET MyOrder.aspx.cs btnSaveOrder_Click behavior:
 * - Creates CustomerOrders header per collection group
 * - Creates CustomerOrdersItems for each line
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

    // Group items by order type AND collection (auto-split mixed ATS/Pre-Order)
    const itemGroups = new Map<string, typeof data.items>()
    for (const item of data.items) {
      const key = _getOrderGroupKey(
        { collectionId: item.collectionId, skuVariantId: item.skuVariantId },
        skuPreOrderMap
      )
      if (!itemGroups.has(key)) {
        itemGroups.set(key, [])
      }
      itemGroups.get(key)!.push(item)
    }

    // Fetch collection windows once for validation
    const allCollectionIds = [
      ...new Set(
        data.items
          .map((i) => i.collectionId)
          .filter((id): id is number => id !== null && id !== undefined)
      ),
    ]

    const collections = allCollectionIds.length > 0
      ? await prisma.collection.findMany({
          where: { id: { in: allCollectionIds } },
          select: { id: true, name: true, shipWindowStart: true, shipWindowEnd: true },
        })
      : []

    const collectionMap = new Map(collections.map((c) => [c.id, c]))

    // Validate each group against its collection window
    for (const [, groupItems] of itemGroups) {
      const groupCollectionIds = [
        ...new Set(
          groupItems
            .map((i) => i.collectionId)
            .filter((id): id is number => id !== null && id !== undefined)
        ),
      ]

      // ATS / uncategorized: no validation
      if (groupCollectionIds.length === 0) continue

      const groupCollections = groupCollectionIds
        .map((id) => collectionMap.get(id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined)

      // Guard: Missing collections should not silently skip validation
      if (groupCollectionIds.length > 0 && groupCollections.length === 0) {
        return {
          success: false,
          error: 'Cannot validate ship dates: collection records missing for one or more items.',
        }
      }

      // Block if any collection lacks windows
      const missingWindows = groupCollections.filter(
        (c) => !c.shipWindowStart || !c.shipWindowEnd
      )
      if (missingWindows.length > 0) {
        const names = missingWindows.map((c) => c.name ?? 'Unknown').join(', ')
        return {
          success: false,
          error: `Cannot validate ship dates: ${names} missing ship window dates.`,
        }
      }

      // Use the same ship dates that will be written to the order header
      const firstItem = groupItems[0]
      const shipStart = (firstItem.shipWindowStart ?? data.shipStartDate).split('T')[0]
      const shipEnd = (firstItem.shipWindowEnd ?? data.shipEndDate).split('T')[0]

      const result = validateShipDates(
        shipStart,
        shipEnd,
        groupCollections.map((c) => ({
          id: c.id,
          name: c.name ?? '',
          shipWindowStart: c.shipWindowStart!.toISOString().split('T')[0],
          shipWindowEnd: c.shipWindowEnd!.toISOString().split('T')[0],
        }))
      )

      if (!result.valid) {
        const names = groupCollections.map((c) => c.name ?? 'Unknown').join(', ')
        return {
          success: false,
          error: `Invalid dates for ${names}: ${result.errors[0]?.message}`,
        }
      }
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

      // Create one order per collection group (and order type)
      for (const [, groupItems] of itemGroups) {
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
            IsPreOrder: isPreOrder, // Derived from Collection.type
            RepID: parseInt(data.salesRepId),
            CustomerID: customerId,
          },
        })

        // Create line items for this group (NO PlannedShipmentID)
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

    // Look up rep name for emails (outside transaction scope)
    const repForEmail = await prisma.reps.findUnique({
      where: { ID: parseInt(data.salesRepId) },
      select: { Name: true },
    })
    const salesRepNameForEmail = repForEmail?.Name ?? ''

    // Send order confirmation emails (non-blocking) unless skipEmail is set
    if (!data.skipEmail) {
      for (const order of createdOrders) {
        sendOrderEmails({
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          storeName: data.storeName,
          buyerName: data.buyerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          salesRep: salesRepNameForEmail,
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

      // Insert new items (NO PlannedShipmentID)
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
        orderDate: new Date(),
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
