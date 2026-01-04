'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import type { OrderStatus } from '@/lib/types/order'

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
