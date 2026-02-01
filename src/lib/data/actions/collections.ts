'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import { recalculateOrderLegacyDates } from './planned-shipments'
import { logShipmentDatesChangedByAdmin } from '@/lib/audit/activity-logger'
import { sendDateChangeEmail } from '@/lib/email/shipment-date-change'
import type {
  CollectionType,
  CollectionFormData,
} from '@/lib/types/collection'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  return session
}

// ============================================================================
// Collection Actions
// ============================================================================

/**
 * Create a new collection
 */
export async function createCollection(data: CollectionFormData) {
  try {
    // Get max sort order for this type
    const maxSort = await prisma.collection.aggregate({
      where: { type: data.type },
      _max: { sortOrder: true },
    })
    const sortOrder = (maxSort._max.sortOrder ?? 0) + 1

    const collection = await prisma.collection.create({
      data: {
        name: data.name,
        type: data.type,
        sortOrder,
        shipWindowStart: data.shipWindowStart ? new Date(data.shipWindowStart) : null,
        shipWindowEnd: data.shipWindowEnd ? new Date(data.shipWindowEnd) : null,
        isActive: true,
      },
    })

    revalidatePath('/admin/collections')
    return { success: true, collection }
  } catch (error) {
    console.error('Failed to create collection:', error)
    return { success: false, error: 'Failed to create collection' }
  }
}

/**
 * Update an existing collection
 */
export async function updateCollection(
  id: number,
  data: Partial<CollectionFormData> & { isActive?: boolean }
) {
  try {
    const updateData: Record<string, unknown> = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.type !== undefined) updateData.type = data.type
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.shipWindowStart !== undefined) {
      updateData.shipWindowStart = data.shipWindowStart
        ? new Date(data.shipWindowStart)
        : null
    }
    if (data.shipWindowEnd !== undefined) {
      updateData.shipWindowEnd = data.shipWindowEnd
        ? new Date(data.shipWindowEnd)
        : null
    }

    const collection = await prisma.collection.update({
      where: { id },
      data: updateData,
    })

    revalidatePath('/admin/collections')
    return { success: true, collection }
  } catch (error) {
    console.error('Failed to update collection:', error)
    return { success: false, error: 'Failed to update collection' }
  }
}

/**
 * Delete a collection (only if no SKUs are assigned)
 */
export async function deleteCollection(id: number) {
  try {
    // Check if any SKUs are assigned
    const skuCount = await prisma.sku.count({
      where: { CollectionID: id },
    })

    if (skuCount > 0) {
      return {
        success: false,
        error: `Cannot delete: ${skuCount} SKUs are assigned to this collection`,
      }
    }

    // Check if any mappings point to this collection
    const mappingCount = await prisma.shopifyValueMapping.count({
      where: { collectionId: id },
    })

    if (mappingCount > 0) {
      return {
        success: false,
        error: `Cannot delete: ${mappingCount} Shopify mappings point to this collection`,
      }
    }

    await prisma.collection.delete({
      where: { id },
    })

    revalidatePath('/admin/collections')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete collection:', error)
    return { success: false, error: 'Failed to delete collection' }
  }
}

/**
 * Reorder collections within a type
 */
export async function reorderCollections(
  type: CollectionType,
  orderedIds: number[]
) {
  try {
    // Update sort order for each collection
    const updates = orderedIds.map((id, index) =>
      prisma.collection.update({
        where: { id },
        data: { sortOrder: index },
      })
    )

    await prisma.$transaction(updates)

    revalidatePath('/admin/collections')
    revalidatePath('/buyer/ats')
    revalidatePath('/buyer/pre-order')
    return { success: true }
  } catch (error) {
    console.error('Failed to reorder collections:', error)
    return { success: false, error: 'Failed to reorder collections' }
  }
}

/**
 * Update collection image URL
 */
export async function updateCollectionImage(id: number, imageUrl: string | null) {
  try {
    await prisma.collection.update({
      where: { id },
      data: { imageUrl },
    })

    revalidatePath('/admin/collections')
    return { success: true }
  } catch (error) {
    console.error('Failed to update collection image:', error)
    return { success: false, error: 'Failed to update collection image' }
  }
}

// ============================================================================
// Shopify Value Mapping Actions
// ============================================================================

/**
 * Map a Shopify value to a collection
 */
export async function mapValueToCollection(mappingId: number, collectionId: number) {
  try {
    await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        collectionId,
        status: 'mapped',
        note: null, // Clear any deferred note
      },
    })

    revalidatePath('/admin/collections/mapping')
    return { success: true }
  } catch (error) {
    console.error('Failed to map value:', error)
    return { success: false, error: 'Failed to map value to collection' }
  }
}

/**
 * Remove mapping from a Shopify value
 */
export async function unmapValue(mappingId: number) {
  try {
    await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        collectionId: null,
        status: 'unmapped',
      },
    })

    revalidatePath('/admin/collections/mapping')
    return { success: true }
  } catch (error) {
    console.error('Failed to unmap value:', error)
    return { success: false, error: 'Failed to unmap value' }
  }
}

/**
 * Defer a Shopify value with a note
 */
export async function deferValue(mappingId: number, note: string) {
  try {
    await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        status: 'deferred',
        note: note || 'Deferred for later review',
        collectionId: null,
      },
    })

    revalidatePath('/admin/collections/mapping')
    return { success: true }
  } catch (error) {
    console.error('Failed to defer value:', error)
    return { success: false, error: 'Failed to defer value' }
  }
}

/**
 * Bulk map multiple values to a collection
 */
export async function bulkMapValues(mappingIds: number[], collectionId: number) {
  try {
    await prisma.shopifyValueMapping.updateMany({
      where: { id: { in: mappingIds } },
      data: {
        collectionId,
        status: 'mapped',
        note: null,
      },
    })

    revalidatePath('/admin/collections/mapping')
    return { success: true, count: mappingIds.length }
  } catch (error) {
    console.error('Failed to bulk map values:', error)
    return { success: false, error: 'Failed to bulk map values' }
  }
}

// ============================================================================
// Phase 8: Collection Date Change Actions
// ============================================================================

interface BulkUpdateInput {
  shipmentIds: string[]
  newStart: string
  newEnd: string
  collectionId: number
  collectionName: string
}

/**
 * Bulk update shipment dates when collection window changes.
 * Uses transaction for atomicity - all updates succeed or all fail.
 */
export async function bulkUpdateShipmentDates(
  input: BulkUpdateInput
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  try {
    const session = await requireAdmin()
    const userName = session.user.name || session.user.loginId

    const newStart = new Date(input.newStart)
    const newEnd = new Date(input.newEnd)

    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Fetch all shipments with order info
      const shipments = await tx.plannedShipment.findMany({
        where: {
          ID: { in: input.shipmentIds.map((id) => BigInt(id)) },
        },
        select: {
          ID: true,
          CustomerOrderID: true,
          PlannedShipStart: true,
          PlannedShipEnd: true,
          Status: true,
          CustomerOrders: {
            select: {
              ID: true,
              OrderNumber: true,
              OrderStatus: true,
              IsTransferredToShopify: true,
            },
          },
        },
      })

      const affectedOrderIds = new Set<bigint>()
      let updatedCount = 0

      for (const shipment of shipments) {
        // Skip if order is not pending or already in Shopify
        if (shipment.CustomerOrders.OrderStatus !== 'Pending') continue
        if (shipment.CustomerOrders.IsTransferredToShopify) continue
        // Only update 'Planned' status shipments
        if (shipment.Status !== 'Planned') continue

        const oldStart = shipment.PlannedShipStart.toISOString().split('T')[0]
        const oldEnd = shipment.PlannedShipEnd.toISOString().split('T')[0]

        // Update dates
        await tx.plannedShipment.update({
          where: { ID: shipment.ID },
          data: {
            PlannedShipStart: newStart,
            PlannedShipEnd: newEnd,
          },
        })

        // Log the change
        await logShipmentDatesChangedByAdmin({
          shipmentId: String(shipment.ID),
          orderId: String(shipment.CustomerOrderID),
          orderNumber: shipment.CustomerOrders.OrderNumber,
          reason: `Collection window change: ${input.collectionName}`,
          oldStart,
          oldEnd,
          newStart: input.newStart,
          newEnd: input.newEnd,
          performedBy: userName,
        })

        affectedOrderIds.add(shipment.CustomerOrderID)
        updatedCount++
      }

      return { affectedOrderIds, updatedCount }
    })

    // Recalculate legacy dates for each affected order (outside transaction)
    for (const orderId of result.affectedOrderIds) {
      await recalculateOrderLegacyDates(orderId)
    }

    revalidatePath('/admin/collections')
    revalidatePath('/admin/orders')

    return { success: true, updatedCount: result.updatedCount }
  } catch (error) {
    console.error('Failed to bulk update shipment dates:', error)
    return {
      success: false,
      updatedCount: 0,
      error: 'Failed to update shipment dates',
    }
  }
}

interface NotifyInput {
  shipmentIds: string[]
  notifyReps: boolean
  notifyCustomers: boolean
  collectionName: string
  oldStart: string
  oldEnd: string
  newStart: string
  newEnd: string
}

/**
 * Send notification emails for shipment date changes.
 */
export async function notifyShipmentDateChanges(
  input: NotifyInput
): Promise<{ success: boolean; emailsSent: number; errors: string[] }> {
  try {
    await requireAdmin()

    const shipments = await prisma.plannedShipment.findMany({
      where: {
        ID: { in: input.shipmentIds.map((id) => BigInt(id)) },
      },
      select: {
        ID: true,
        PlannedShipStart: true,
        PlannedShipEnd: true,
        CustomerOrders: {
          select: {
            ID: true,
            OrderNumber: true,
            StoreName: true,
            CustomerEmail: true,
            SalesRep: true,
            RepID: true,
          },
        },
      },
    })

    // Batch fetch rep emails
    const repIds = [
      ...new Set(
        shipments
          .map((s) => s.CustomerOrders.RepID)
          .filter((id): id is number => id != null)
      ),
    ]
    const reps =
      repIds.length > 0
        ? await prisma.reps.findMany({
            where: { ID: { in: repIds } },
            select: { ID: true, Email1: true },
          })
        : []
    const repEmailMap = new Map(reps.map((r) => [r.ID, r.Email1]))

    let emailsSent = 0
    const errors: string[] = []

    for (const shipment of shipments) {
      const order = shipment.CustomerOrders

      if (input.notifyReps && order.RepID) {
        const repEmail = repEmailMap.get(order.RepID)
        if (repEmail) {
          try {
            await sendDateChangeEmail({
              to: repEmail,
              recipientName: order.SalesRep || 'Sales Rep',
              orderNumber: order.OrderNumber,
              orderId: String(order.ID),
              storeName: order.StoreName || '',
              collectionName: input.collectionName,
              oldStart: input.oldStart,
              oldEnd: input.oldEnd,
              newStart: input.newStart,
              newEnd: input.newEnd,
              isRep: true,
            })
            emailsSent++
          } catch {
            errors.push(`Failed to email rep for ${order.OrderNumber}`)
          }
        }
      }

      if (input.notifyCustomers && order.CustomerEmail) {
        try {
          await sendDateChangeEmail({
            to: order.CustomerEmail,
            recipientName: order.StoreName || 'Customer',
            orderNumber: order.OrderNumber,
            orderId: String(order.ID),
            storeName: order.StoreName || '',
            collectionName: input.collectionName,
            oldStart: input.oldStart,
            oldEnd: input.oldEnd,
            newStart: input.newStart,
            newEnd: input.newEnd,
            isRep: false,
          })
          emailsSent++
        } catch {
          errors.push(`Failed to email customer for ${order.OrderNumber}`)
        }
      }
    }

    return { success: true, emailsSent, errors }
  } catch (error) {
    console.error('Failed to send notifications:', error)
    return {
      success: false,
      emailsSent: 0,
      errors: ['Failed to send notifications'],
    }
  }
}
