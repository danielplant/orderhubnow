/**
 * Shipment helper utilities.
 *
 * These are pure utility functions (not server actions) that help with
 * planned shipment calculations.
 */

import type { PlannedShipmentData, CreateOrderInput } from '@/lib/schemas/order'
import { getATSDefaultDates } from '@/lib/validation/ship-window'

/**
 * Find which planned shipment a SKU belongs to.
 */
export function findShipmentIdForSku(
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
export function deriveShipmentsFromItems(
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
