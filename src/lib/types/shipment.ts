/**
 * Shipment-related domain types for Faire-style shipping workflow.
 */

// ============================================================================
// Carrier Types
// ============================================================================

/**
 * Supported shipping carriers.
 */
export const CARRIERS = ['UPS', 'FedEx', 'USPS', 'DHL', 'Other'] as const;
export type Carrier = (typeof CARRIERS)[number];

// ============================================================================
// Input Types (for creating/updating shipments)
// ============================================================================

/**
 * Single line item to include in a shipment.
 */
export interface ShipmentItemInput {
  orderItemId: string;
  quantityShipped: number;
  priceOverride?: number; // Optional price adjustment
}

/**
 * Tracking info to add to a shipment.
 */
export interface TrackingInput {
  carrier: Carrier;
  trackingNumber: string;
}

/**
 * Input for creating a new shipment.
 */
export interface CreateShipmentInput {
  orderId: string;
  items: ShipmentItemInput[];
  shippingCost: number;
  tracking?: TrackingInput;
  notes?: string;
  shipDate?: string; // ISO date string
}

/**
 * Input for updating an existing shipment.
 */
export interface UpdateShipmentInput {
  shipmentId: string;
  shippingCost?: number;
  notes?: string;
  shipDate?: string; // ISO date string
}

// ============================================================================
// Output Types (for displaying shipments)
// ============================================================================

/**
 * Tracking record attached to a shipment.
 */
export interface TrackingRecord {
  id: string;
  carrier: Carrier;
  trackingNumber: string;
  addedAt: string; // ISO date string
  trackingUrl?: string; // Generated URL for carrier tracking page
}

/**
 * Line item within a shipment.
 */
export interface ShipmentItemRow {
  id: string;
  orderItemId: string;
  sku: string;
  productName: string;
  orderedQuantity: number;
  shippedQuantity: number;
  unitPrice: number;
  priceOverride?: number;
  lineTotal: number;
}

/**
 * Full shipment record for display.
 */
export interface ShipmentRow {
  id: string;
  orderId: string;
  orderNumber: string;
  shippedSubtotal: number;
  shippingCost: number;
  shippedTotal: number;
  shipDate: string | null;
  internalNotes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  shopifyFulfillmentId: string | null;
  tracking: TrackingRecord[];
  items: ShipmentItemRow[];
}

/**
 * Summary of shipments for an order (used in orders table).
 */
export interface OrderShipmentSummary {
  shipmentCount: number;
  totalShipped: number; // Sum of all ShippedTotal values
  trackingCount: number;
  trackingNumbers: string[]; // First few tracking numbers for display
  isFullyShipped: boolean;
}

// ============================================================================
// Order Items with Shipment Status
// ============================================================================

/**
 * Order line item with fulfillment status.
 */
export interface OrderItemWithFulfillment {
  id: string;
  sku: string;
  shopifySku: string | null; // Clean SKU from Shopify (null if not matched)
  productName: string;
  orderedQuantity: number;
  shippedQuantity: number; // Sum across all shipments
  remainingQuantity: number;
  unitPrice: number;
  priceCurrency: string;
  notes: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a tracking URL for common carriers.
 */
export function getTrackingUrl(carrier: Carrier, trackingNumber: string): string | undefined {
  const encodedTracking = encodeURIComponent(trackingNumber);

  switch (carrier) {
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${encodedTracking}`;
    case 'FedEx':
      return `https://www.fedex.com/fedextrack/?trknbr=${encodedTracking}`;
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodedTracking}`;
    case 'DHL':
      return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodedTracking}`;
    default:
      return undefined;
  }
}

/**
 * Calculate variance between original order and shipped total.
 * Positive = shipped more than ordered, Negative = shipped less.
 */
export function calculateVariance(orderAmount: number, shippedTotal: number): number {
  return shippedTotal - orderAmount;
}

/**
 * Format variance for display with color coding hint.
 */
export function formatVariance(variance: number): {
  formatted: string;
  color: 'red' | 'green' | 'neutral'
} {
  const formatted = variance >= 0
    ? `+$${variance.toFixed(2)}`
    : `-$${Math.abs(variance).toFixed(2)}`;

  const color = variance < 0 ? 'red' : variance > 0 ? 'green' : 'neutral';

  return { formatted, color };
}
