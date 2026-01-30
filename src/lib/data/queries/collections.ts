/**
 * Collection-related queries.
 */

import { prisma } from '@/lib/prisma'
import type { AffectedOrder, AffectedOrdersResult } from '@/lib/types/planned-shipment'

/**
 * Find all orders/shipments affected by a collection ship window change.
 *
 * Uses two-step query pattern since CustomerOrdersItems.SKU is a string field,
 * not a relation to the Sku model.
 *
 * Only includes:
 * - PlannedShipments with Status = 'Planned' (not already fulfilled)
 * - Orders with OrderStatus = 'Pending' (not invoiced/cancelled)
 * - Orders not transferred to Shopify
 *
 * @param collectionId - The collection whose window is changing
 * @param newWindowStart - New ship window start date (YYYY-MM-DD)
 * @param newWindowEnd - New ship window end date (YYYY-MM-DD)
 */
export async function getAffectedOrdersByWindowChange(
  collectionId: number,
  newWindowStart: string,
  newWindowEnd: string
): Promise<AffectedOrdersResult> {
  // Step 0: Verify collection is PreOrder (ATS has no ship windows)
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { type: true },
  })
  if (collection?.type !== 'PreOrder') {
    return {
      affected: [],
      totalOrders: 0,
      totalShipments: 0,
      invalidCount: 0,
      shopifyExcludedCount: 0,
    }
  }

  // Step 1: Find SKU IDs in this collection
  const skusInCollection = await prisma.sku.findMany({
    where: { CollectionID: collectionId },
    select: { SkuID: true },
  })
  const skuIds = skusInCollection.map((s) => s.SkuID)

  if (skuIds.length === 0) {
    return {
      affected: [],
      totalOrders: 0,
      totalShipments: 0,
      invalidCount: 0,
      shopifyExcludedCount: 0,
    }
  }

  // Step 2: Find PlannedShipments with items using those SKUs
  // Only include shipments with Status = 'Planned' (exclude PartiallyFulfilled/Fulfilled)
  const shipments = await prisma.plannedShipment.findMany({
    where: {
      Items: { some: { SKU: { in: skuIds } } },
      Status: 'Planned', // Only unshipped shipments can have dates updated
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
          StoreName: true, // Direct string field
          CustomerEmail: true, // Direct string field
          SalesRep: true, // Direct string field (rep name)
          RepID: true, // FK for email lookup
        },
      },
      Items: {
        select: { ID: true, Quantity: true, Price: true },
        where: { SKU: { in: skuIds } },
      },
    },
  })

  // Step 3: Batch fetch rep emails for orders with RepID
  const repIds = [
    ...new Set(shipments.map((s) => s.CustomerOrders.RepID).filter(Boolean)),
  ] as number[]
  const reps =
    repIds.length > 0
      ? await prisma.reps.findMany({
          where: { ID: { in: repIds } },
          select: { ID: true, Email1: true },
        })
      : []
  const repEmailMap = new Map(reps.map((r) => [r.ID, r.Email1]))

  // Step 4: Filter and build affected list
  const newStart = new Date(newWindowStart)
  const newEnd = new Date(newWindowEnd)
  let shopifyExcludedCount = 0
  const affected: AffectedOrder[] = []

  for (const shipment of shipments) {
    const order = shipment.CustomerOrders

    // Skip non-pending orders
    if (order.OrderStatus !== 'Pending') continue

    // Count but exclude Shopify-transferred orders
    if (order.IsTransferredToShopify) {
      shopifyExcludedCount++
      continue
    }

    // Calculate validity
    const currentStart = shipment.PlannedShipStart
    const currentEnd = shipment.PlannedShipEnd
    const isStartInvalid = currentStart < newStart
    const isEndInvalid = currentEnd < newEnd
    const suggestedStart = isStartInvalid ? newStart : currentStart
    const suggestedEnd = isEndInvalid ? newEnd : currentEnd

    // Item stats for this collection only
    const itemCount = shipment.Items.length
    const subtotal = shipment.Items.reduce(
      (sum, i) => sum + i.Price * i.Quantity,
      0
    )

    affected.push({
      orderId: String(order.ID),
      orderNumber: order.OrderNumber,
      shipmentId: String(shipment.ID),
      currentStart: currentStart.toISOString().split('T')[0],
      currentEnd: currentEnd.toISOString().split('T')[0],
      suggestedStart: suggestedStart.toISOString().split('T')[0],
      suggestedEnd: suggestedEnd.toISOString().split('T')[0],
      isInvalid: isStartInvalid || isEndInvalid,
      isStartInvalid,
      isEndInvalid,
      repName: order.SalesRep || null,
      repEmail: order.RepID ? (repEmailMap.get(order.RepID) ?? null) : null,
      customerEmail: order.CustomerEmail || null,
      storeName: order.StoreName || null,
      itemCount,
      subtotal,
    })
  }

  const orderIds = new Set(affected.map((a) => a.orderId))

  return {
    affected,
    totalOrders: orderIds.size,
    totalShipments: affected.length,
    invalidCount: affected.filter((a) => a.isInvalid).length,
    shopifyExcludedCount,
  }
}
