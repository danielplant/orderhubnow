'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import { validateShipDates } from '@/lib/validation/ship-window'
import { updatePlannedShipmentStatus } from './shipments'
import { logItemMoved } from '@/lib/audit/activity-logger'
import type { UpdateShipmentDatesInput, MoveItemInput } from '@/lib/types/planned-shipment'

/**
 * Require admin role. Matches pattern used in orders.ts.
 */
async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  return session
}

/**
 * Update planned shipment dates.
 * Validates against collection window before saving.
 */
export async function updatePlannedShipmentDates(
  input: UpdateShipmentDatesInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()

    const { shipmentId, plannedShipStart, plannedShipEnd } = input

    // Get shipment with order status
    const shipment = await prisma.plannedShipment.findUnique({
      where: { ID: BigInt(shipmentId) },
      include: {
        CustomerOrders: {
          select: { ID: true, OrderStatus: true, IsTransferredToShopify: true },
        },
      },
    })

    if (!shipment) {
      return { success: false, error: 'Shipment not found' }
    }

    // Only allow edits on Pending orders not in Shopify
    if (shipment.CustomerOrders.OrderStatus !== 'Pending') {
      return { success: false, error: 'Can only edit dates on Pending orders' }
    }
    if (shipment.CustomerOrders.IsTransferredToShopify) {
      return { success: false, error: 'Cannot edit orders transferred to Shopify' }
    }

    // Validate against collection window
    if (shipment.CollectionID) {
      const collection = await prisma.collection.findUnique({
        where: { id: shipment.CollectionID },
        select: { name: true, shipWindowStart: true, shipWindowEnd: true },
      })

      if (collection?.shipWindowStart && collection?.shipWindowEnd) {
        const result = validateShipDates(
          plannedShipStart,
          plannedShipEnd,
          [{
            id: shipment.CollectionID,
            name: collection.name,
            shipWindowStart: collection.shipWindowStart.toISOString().slice(0, 10),
            shipWindowEnd: collection.shipWindowEnd.toISOString().slice(0, 10),
          }]
        )

        if (!result.valid) {
          return {
            success: false,
            error: result.errors[0]?.message || 'Invalid dates',
          }
        }
      }
    }

    // Update shipment
    await prisma.plannedShipment.update({
      where: { ID: BigInt(shipmentId) },
      data: {
        PlannedShipStart: new Date(plannedShipStart),
        PlannedShipEnd: new Date(plannedShipEnd),
        UpdatedAt: new Date(),
      },
    })

    // Recalculate order header legacy dates
    await recalculateOrderLegacyDates(shipment.CustomerOrders.ID)

    revalidatePath(`/admin/orders/${shipment.CustomerOrders.ID}`)
    return { success: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update dates'
    return { success: false, error: message }
  }
}

/**
 * Recalculate order header dates from all planned shipments.
 * Exported for use by collection date change bulk updates.
 */
export async function recalculateOrderLegacyDates(orderId: bigint): Promise<void> {
  const shipments = await prisma.plannedShipment.findMany({
    where: { CustomerOrderID: orderId },
    select: { PlannedShipStart: true, PlannedShipEnd: true },
  })

  if (shipments.length === 0) return

  const starts = shipments.map((s) => s.PlannedShipStart.getTime())
  const ends = shipments.map((s) => s.PlannedShipEnd.getTime())

  await prisma.customerOrders.update({
    where: { ID: orderId },
    data: {
      ShipStartDate: new Date(Math.min(...starts)),
      ShipEndDate: new Date(Math.max(...ends)),
    },
  })
}

/**
 * Move an item between planned shipments.
 * Validates item's collection dates against target shipment dates.
 * Allows override with explicit confirmation.
 */
export async function moveItemBetweenShipments(
  input: MoveItemInput & { allowOverride?: boolean }
): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const session = await requireAdmin()
    const userName = session.user.name || session.user.loginId

    // 1. Fetch the item
    const item = await prisma.customerOrdersItems.findUnique({
      where: { ID: BigInt(input.orderItemId) },
      select: {
        ID: true,
        SKU: true,
        PlannedShipmentID: true,
        CustomerOrderID: true,
      },
    })

    if (!item) {
      return { success: false, error: 'Item not found' }
    }

    // Verify item is in the source shipment
    if (item.PlannedShipmentID?.toString() !== input.fromShipmentId) {
      return { success: false, error: 'Item is not in the specified source shipment' }
    }

    // 2. Fetch collection info via SKU
    const sku = await prisma.sku.findUnique({
      where: { SkuID: item.SKU },
      select: {
        Collection: {
          select: { id: true, name: true, shipWindowStart: true, shipWindowEnd: true },
        },
      },
    })

    // 3. Fetch source and target shipments with order info
    const [sourceShipment, targetShipment] = await Promise.all([
      prisma.plannedShipment.findUnique({
        where: { ID: BigInt(input.fromShipmentId) },
        include: {
          CustomerOrders: {
            select: { ID: true, OrderNumber: true, OrderStatus: true, IsTransferredToShopify: true },
          },
        },
      }),
      prisma.plannedShipment.findUnique({
        where: { ID: BigInt(input.toShipmentId) },
        select: {
          ID: true,
          PlannedShipStart: true,
          PlannedShipEnd: true,
          CustomerOrderID: true,
        },
      }),
    ])

    if (!sourceShipment) {
      return { success: false, error: 'Source shipment not found' }
    }
    if (!targetShipment) {
      return { success: false, error: 'Target shipment not found' }
    }

    // Verify both shipments belong to the same order
    if (sourceShipment.CustomerOrderID.toString() !== targetShipment.CustomerOrderID.toString()) {
      return { success: false, error: 'Cannot move item between different orders' }
    }

    // 4. Validate order is Pending and not in Shopify
    if (sourceShipment.CustomerOrders.OrderStatus !== 'Pending') {
      return { success: false, error: 'Can only move items on Pending orders' }
    }
    if (sourceShipment.CustomerOrders.IsTransferredToShopify) {
      return { success: false, error: 'Cannot move items on orders transferred to Shopify' }
    }

    // 5. Validate item's collection dates against target shipment dates
    const collection = sku?.Collection
    if (collection?.shipWindowStart && collection?.shipWindowEnd) {
      const targetStartDate = targetShipment.PlannedShipStart.toISOString().slice(0, 10)
      const targetEndDate = targetShipment.PlannedShipEnd.toISOString().slice(0, 10)

      const result = validateShipDates(targetStartDate, targetEndDate, [
        {
          id: collection.id,
          name: collection.name,
          shipWindowStart: collection.shipWindowStart.toISOString().slice(0, 10),
          shipWindowEnd: collection.shipWindowEnd.toISOString().slice(0, 10),
        },
      ])

      if (!result.valid) {
        const warningMessage = result.errors[0]?.message || 'Target shipment dates violate collection window'
        if (!input.allowOverride) {
          return {
            success: false,
            warning: warningMessage,
          }
        }
        // Override allowed - proceed but log the override
      }
    }

    // 6. Update item's PlannedShipmentID
    await prisma.customerOrdersItems.update({
      where: { ID: BigInt(input.orderItemId) },
      data: { PlannedShipmentID: BigInt(input.toShipmentId) },
    })

    // 7. Update status for both source and target shipments
    await updatePlannedShipmentStatus(BigInt(input.fromShipmentId))
    await updatePlannedShipmentStatus(BigInt(input.toShipmentId))

    // 8. Check if source shipment has 0 items remaining
    const remainingItemsCount = await prisma.customerOrdersItems.count({
      where: { PlannedShipmentID: BigInt(input.fromShipmentId) },
    })

    if (remainingItemsCount === 0) {
      // Check if source has linked fulfillments
      const linkedFulfillments = await prisma.shipments.count({
        where: { PlannedShipmentID: BigInt(input.fromShipmentId) },
      })

      if (linkedFulfillments === 0) {
        // Safe to delete empty shipment
        await prisma.plannedShipment.delete({
          where: { ID: BigInt(input.fromShipmentId) },
        })
        // Recalculate order legacy dates after deletion
        await recalculateOrderLegacyDates(sourceShipment.CustomerOrderID)
      }
      // If has fulfillments, keep the shipment (don't orphan FK references)
    }

    // 9. Log activity
    await logItemMoved({
      itemId: input.orderItemId,
      orderId: sourceShipment.CustomerOrderID.toString(),
      orderNumber: sourceShipment.CustomerOrders.OrderNumber || '',
      sku: item.SKU,
      fromShipmentId: input.fromShipmentId,
      toShipmentId: input.toShipmentId,
      wasOverride: !!input.allowOverride,
      performedBy: userName,
    })

    // 10. Revalidate paths
    const orderId = sourceShipment.CustomerOrderID.toString()
    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)

    return { success: true }
  } catch (e) {
    console.error('moveItemBetweenShipments error:', e)
    const message = e instanceof Error ? e.message : 'Failed to move item'
    return { success: false, error: message }
  }
}
