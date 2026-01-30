/**
 * Types for the planned shipments feature.
 *
 * Date format: All dates use ISO string format (YYYY-MM-DD).
 *
 * These will align with Prisma schema when we run migration.
 */

export type ShipmentType = 'Planned' | 'Fulfillment'

export type ShipmentStatus = 'Planned' | 'PartiallyFulfilled' | 'Fulfilled' | 'Cancelled'

/**
 * Planned shipment in the cart (before submission).
 *
 * Uses itemIds (stable identifiers) instead of array indices to avoid
 * fragility when items are reordered or removed.
 */
export interface CartPlannedShipment {
  id: string // Temp ID (e.g., "temp-collection-45")
  collectionId: number | null // null if combined from multiple collections
  collectionName: string | null
  itemIds: string[] // Stable item identifiers (SKU or temp ID)
  plannedShipStart: string // ISO date (YYYY-MM-DD)
  plannedShipEnd: string // ISO date (YYYY-MM-DD)
  minAllowedStart: string | null // From collection, for UI validation
  minAllowedEnd: string | null // From collection, for UI validation
}

/**
 * Planned shipment for display (with computed fields).
 */
export interface PlannedShipmentDisplay {
  id: string
  collectionId: number | null
  collectionName: string | null
  plannedShipStart: string
  plannedShipEnd: string
  status: ShipmentStatus
  itemCount: number
  subtotal: number
  items: PlannedShipmentItem[]
  itemIds: string[] // Phase 6: For collection filtering in ShipmentModal
  // Collection constraints for admin UI validation
  minAllowedStart: string | null // From collection, for validation
  minAllowedEnd: string | null // From collection, for validation
}

/**
 * Item within a planned shipment.
 */
export interface PlannedShipmentItem {
  orderItemId: string
  sku: string
  description: string
  quantity: number
  quantityFulfilled: number
  quantityRemaining: number
  price: number
  lineTotal: number
  collectionId: number | null
  collectionName: string | null // For display in combined shipments
}

/**
 * Input for creating planned shipments with order.
 * Uses itemIds for stable references.
 */
export interface PlannedShipmentInput {
  collectionId: number | null
  itemIds: string[] // Stable item identifiers
  plannedShipStart: string
  plannedShipEnd: string
}

/**
 * Input for updating planned shipment dates.
 */
export interface UpdateShipmentDatesInput {
  shipmentId: string
  plannedShipStart: string
  plannedShipEnd: string
  reason?: string
  isOverride?: boolean // True if date is before collection window
  notifyRep?: boolean
  notifyCustomer?: boolean
}

/**
 * Input for moving item between shipments.
 */
export interface MoveItemInput {
  orderItemId: string
  fromShipmentId: string
  toShipmentId: string
}

/**
 * Result of combining shipments.
 */
export interface CombineShipmentsResult {
  success: boolean
  error?: string
  mergedShipment?: CartPlannedShipment
}

/**
 * Order affected by collection date change.
 */
export interface AffectedOrder {
  orderId: string
  orderNumber: string
  shipmentId: string
  currentStart: string
  currentEnd: string
  isInvalid: boolean // True if dates now outside new window
  repName: string | null
  repEmail: string | null
  customerEmail: string | null
  storeName: string | null
  // Phase 8: Additional fields for dashboard
  suggestedStart: string // Max(currentStart, newWindowStart)
  suggestedEnd: string // Max(currentEnd, newWindowEnd)
  isStartInvalid: boolean // currentStart < newWindowStart
  isEndInvalid: boolean // currentEnd < newWindowEnd
  itemCount: number // Items from this collection in the shipment
  subtotal: number // Subtotal for items from this collection
}

/**
 * Result of getAffectedOrdersByWindowChange query.
 */
export interface AffectedOrdersResult {
  affected: AffectedOrder[]
  totalOrders: number
  totalShipments: number
  invalidCount: number
  shopifyExcludedCount: number
}

/**
 * Decision for handling an affected order during collection date change.
 */
export interface AffectedOrderDecision {
  orderId: string
  updateDates: boolean
  newStart?: string
  newEnd?: string
  notifyRep: boolean
  notifyCustomer: boolean
}

/**
 * Minimum cart item fields needed for shipment grouping.
 * This is what the UI needs to group items into shipments.
 */
export interface CartItemForGrouping {
  id: string // Stable identifier
  sku: string
  collectionId: number | null
  collectionName: string | null
  quantity: number
  price: number
}
