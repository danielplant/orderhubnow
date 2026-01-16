/**
 * Activity Logger Service
 * 
 * Centralized logging for all significant actions in the system.
 * Provides audit trail for orders, shipments, items, and customers.
 */

import { prisma } from '@/lib/prisma'

// ============================================================================
// Types
// ============================================================================

export type EntityType = 'order' | 'shipment' | 'customer' | 'item'

export type ActivityAction =
  // Order actions
  | 'order_created'
  | 'order_updated'
  | 'order_cancelled'
  | 'order_status_changed'
  // Shipment actions
  | 'shipment_created'
  | 'shipment_voided'
  | 'shipment_edited'
  | 'tracking_added'
  | 'tracking_updated'
  // Item actions
  | 'item_cancelled'
  | 'item_edited'
  | 'item_added'
  | 'item_removed'
  // Document actions
  | 'document_generated'
  | 'email_sent'
  // Customer actions
  | 'customer_created'
  | 'customer_updated'

export interface LogActivityParams {
  entityType: EntityType
  entityId: string
  action: ActivityAction
  description?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  performedBy?: string
  orderNumber?: string
  orderId?: string
}

export interface ActivityLogEntry {
  id: string
  entityType: EntityType
  entityId: string
  action: ActivityAction
  description: string | null
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  performedBy: string | null
  timestamp: Date
  orderNumber: string | null
}

// ============================================================================
// Logger Functions
// ============================================================================

/**
 * Log an activity to the database
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLogs.create({
      data: {
        EntityType: params.entityType,
        EntityID: BigInt(params.entityId),
        Action: params.action,
        Description: params.description ?? formatDescription(params),
        OldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        NewValues: params.newValues ? JSON.stringify(params.newValues) : null,
        PerformedBy: params.performedBy ?? null,
        OrderNumber: params.orderNumber ?? null,
        OrderId: params.orderId ? BigInt(params.orderId) : null,
        DateAdded: new Date(),
      },
    })
  } catch (error) {
    // Log to console but don't throw - activity logging should never break the main flow
    console.error('Failed to log activity:', error)
  }
}

/**
 * Get activity log for a specific entity
 */
export async function getActivityLog(
  entityType: EntityType,
  entityId: string,
  limit: number = 50
): Promise<ActivityLogEntry[]> {
  const logs = await prisma.activityLogs.findMany({
    where: {
      EntityType: entityType,
      EntityID: BigInt(entityId),
    },
    orderBy: {
      DateAdded: 'desc',
    },
    take: limit,
  })

  return logs.map(mapLogEntry)
}

/**
 * Get activity log for an order (includes related shipments and items)
 */
export async function getOrderActivityLog(
  orderId: string,
  limit: number = 100
): Promise<ActivityLogEntry[]> {
  const logs = await prisma.activityLogs.findMany({
    where: {
      OR: [
        { OrderId: BigInt(orderId) },
        { EntityType: 'order', EntityID: BigInt(orderId) },
      ],
    },
    orderBy: {
      DateAdded: 'desc',
    },
    take: limit,
  })

  return logs.map(mapLogEntry)
}

/**
 * Get recent activity across all entities
 */
export async function getRecentActivity(limit: number = 50): Promise<ActivityLogEntry[]> {
  const logs = await prisma.activityLogs.findMany({
    where: {
      Action: { not: null },
    },
    orderBy: {
      DateAdded: 'desc',
    },
    take: limit,
  })

  return logs.map(mapLogEntry)
}

/**
 * Get activity summary counts by action type
 */
export async function getActivitySummary(
  dateFrom?: Date,
  dateTo?: Date
): Promise<Record<string, number>> {
  const where: { DateAdded?: { gte?: Date; lte?: Date }; Action?: { not: null } } = {
    Action: { not: null },
  }
  
  if (dateFrom || dateTo) {
    where.DateAdded = {}
    if (dateFrom) where.DateAdded.gte = dateFrom
    if (dateTo) where.DateAdded.lte = dateTo
  }

  const logs = await prisma.activityLogs.groupBy({
    by: ['Action'],
    where,
    _count: { ID: true },
  })

  const summary: Record<string, number> = {}
  for (const log of logs) {
    if (log.Action) {
      summary[log.Action] = log._count.ID
    }
  }
  return summary
}

// ============================================================================
// Helpers
// ============================================================================

function mapLogEntry(log: {
  ID: bigint
  EntityType: string | null
  EntityID: bigint | null
  Action: string | null
  Description: string | null
  OldValues: string | null
  NewValues: string | null
  PerformedBy: string | null
  DateAdded: Date
  OrderNumber: string | null
}): ActivityLogEntry {
  return {
    id: log.ID.toString(),
    entityType: (log.EntityType || 'order') as EntityType,
    entityId: log.EntityID?.toString() || '',
    action: (log.Action || 'order_updated') as ActivityAction,
    description: log.Description,
    oldValues: log.OldValues ? JSON.parse(log.OldValues) : null,
    newValues: log.NewValues ? JSON.parse(log.NewValues) : null,
    performedBy: log.PerformedBy,
    timestamp: log.DateAdded,
    orderNumber: log.OrderNumber,
  }
}

function formatDescription(params: LogActivityParams): string {
  const actionLabels: Record<ActivityAction, string> = {
    order_created: 'Order created',
    order_updated: 'Order updated',
    order_cancelled: 'Order cancelled',
    order_status_changed: 'Order status changed',
    shipment_created: 'Shipment created',
    shipment_voided: 'Shipment voided',
    shipment_edited: 'Shipment edited',
    tracking_added: 'Tracking number added',
    tracking_updated: 'Tracking number updated',
    item_cancelled: 'Item cancelled',
    item_edited: 'Item edited',
    item_added: 'Item added',
    item_removed: 'Item removed',
    document_generated: 'Document generated',
    email_sent: 'Email sent',
    customer_created: 'Customer created',
    customer_updated: 'Customer updated',
  }

  return actionLabels[params.action] || params.action
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Log a shipment creation
 */
export async function logShipmentCreated(params: {
  shipmentId: string
  orderId: string
  orderNumber: string
  unitsShipped: number
  totalAmount: number
  performedBy: string
}): Promise<void> {
  await logActivity({
    entityType: 'shipment',
    entityId: params.shipmentId,
    action: 'shipment_created',
    description: `Shipment created: ${params.unitsShipped} units, $${params.totalAmount.toFixed(2)}`,
    newValues: {
      unitsShipped: params.unitsShipped,
      totalAmount: params.totalAmount,
    },
    performedBy: params.performedBy,
    orderNumber: params.orderNumber,
    orderId: params.orderId,
  })
}

/**
 * Log a shipment void
 */
export async function logShipmentVoided(params: {
  shipmentId: string
  orderId: string
  orderNumber: string
  reason?: string
  performedBy: string
}): Promise<void> {
  await logActivity({
    entityType: 'shipment',
    entityId: params.shipmentId,
    action: 'shipment_voided',
    description: params.reason ? `Shipment voided: ${params.reason}` : 'Shipment voided',
    newValues: { reason: params.reason },
    performedBy: params.performedBy,
    orderNumber: params.orderNumber,
    orderId: params.orderId,
  })
}

/**
 * Log an item cancellation
 */
export async function logItemCancelled(params: {
  itemId: string
  orderId: string
  orderNumber: string
  sku: string
  quantity: number
  reason: string
  performedBy: string
}): Promise<void> {
  await logActivity({
    entityType: 'item',
    entityId: params.itemId,
    action: 'item_cancelled',
    description: `${params.sku}: ${params.quantity} units cancelled - ${params.reason}`,
    newValues: {
      sku: params.sku,
      quantity: params.quantity,
      reason: params.reason,
    },
    performedBy: params.performedBy,
    orderNumber: params.orderNumber,
    orderId: params.orderId,
  })
}

/**
 * Log document generation
 */
export async function logDocumentGenerated(params: {
  shipmentId: string
  orderId: string
  orderNumber: string
  documentType: 'packing_slip' | 'shipping_invoice'
  documentNumber: string
  performedBy?: string
}): Promise<void> {
  await logActivity({
    entityType: 'shipment',
    entityId: params.shipmentId,
    action: 'document_generated',
    description: `${params.documentType === 'packing_slip' ? 'Packing slip' : 'Invoice'} generated: ${params.documentNumber}`,
    newValues: {
      documentType: params.documentType,
      documentNumber: params.documentNumber,
    },
    performedBy: params.performedBy,
    orderNumber: params.orderNumber,
    orderId: params.orderId,
  })
}

/**
 * Email types that can be logged.
 */
export type EmailType =
  | 'shipment_confirmation'
  | 'tracking_update'
  | 'rep_notification'
  | 'order_confirmation'
  | 'order_update'
  | 'sales_notification'

/**
 * Log email sent
 */
export async function logEmailSent(params: {
  entityType: EntityType
  entityId: string
  orderId: string
  orderNumber: string
  emailType: EmailType
  recipient: string
  performedBy?: string
}): Promise<void> {
  await logActivity({
    entityType: params.entityType,
    entityId: params.entityId,
    action: 'email_sent',
    description: `${params.emailType.replace(/_/g, ' ')} sent to ${params.recipient}`,
    newValues: {
      emailType: params.emailType,
      recipient: params.recipient,
    },
    performedBy: params.performedBy,
    orderNumber: params.orderNumber,
    orderId: params.orderId,
  })
}

/**
 * Email log entry with parsed values.
 */
export interface OrderEmailLogEntry {
  id: string
  emailType: EmailType
  recipient: string
  timestamp: Date
  performedBy: string | null
}

/**
 * Get email logs for a specific order.
 */
export async function getOrderEmailLogs(orderId: string): Promise<OrderEmailLogEntry[]> {
  const logs = await prisma.activityLogs.findMany({
    where: {
      OrderId: BigInt(orderId),
      Action: 'email_sent',
    },
    orderBy: {
      DateAdded: 'desc',
    },
    take: 50,
  })

  return logs.map((log) => {
    let emailType: EmailType = 'order_confirmation'
    let recipient = ''

    if (log.NewValues) {
      try {
        const parsed = JSON.parse(log.NewValues)
        emailType = parsed.emailType || 'order_confirmation'
        recipient = parsed.recipient || ''
      } catch {
        // Ignore parse errors
      }
    }

    return {
      id: log.ID.toString(),
      emailType,
      recipient,
      timestamp: log.DateAdded,
      performedBy: log.PerformedBy,
    }
  })
}
