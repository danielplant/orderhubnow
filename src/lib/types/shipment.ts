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

/**
 * Line item fulfillment status.
 */
export const LINE_ITEM_STATUSES = ['Open', 'Shipped', 'Cancelled'] as const;
export type LineItemStatus = (typeof LINE_ITEM_STATUSES)[number];

/**
 * Standard cancellation reasons for line items.
 */
export const CANCEL_REASONS = [
  'Out of stock',
  'Discontinued',
  'Customer request',
  'Damaged/defective',
  'Price error',
  'Other',
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

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
  // Notification options
  notifyCustomer?: boolean;
  attachInvoice?: boolean;
  attachPackingSlip?: boolean;
  notifyRep?: boolean;
  notifyShopify?: boolean; // Shopify's notify_customer flag
  // Email override (one-time, doesn't update order)
  customerEmailOverride?: string;
}

/**
 * Result of email notifications sent with shipment.
 */
export interface EmailsSentInfo {
  customer?: {
    email: string;
    attachments: string[];
  };
  rep?: {
    email: string;
  };
  shopify?: boolean;
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
  // Void status
  isVoided: boolean;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  voidNotes: string | null;
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
  cancelledQuantity: number; // Quantity cancelled
  remainingQuantity: number; // ordered - shipped - cancelled
  unitPrice: number;
  priceCurrency: string;
  notes: string;
  // Line item status tracking
  status: LineItemStatus;
  cancelledReason: CancelReason | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
}

/**
 * Input for cancelling order items.
 */
export interface CancelOrderItemInput {
  itemId: string;
  quantity: number; // Quantity to cancel (can be partial)
  reason: CancelReason;
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

// ============================================================================
// Action Result Types
// ============================================================================

/**
 * Result from createShipment action.
 */
export interface CreateShipmentResult {
  success: boolean
  shipmentId?: string
  shopifyFulfillmentId?: string | null
  error?: string
  emailsSent?: {
    customer?: { email: string; attachments: string[] }
    rep?: { email: string }
    shopify?: boolean
  }
}

/**
 * Result from updateShipment action.
 */
export interface UpdateShipmentResult {
  success: boolean
  error?: string
}

/**
 * Result from addTracking action.
 */
export interface AddTrackingResult {
  success: boolean
  trackingId?: string
  error?: string
}

/**
 * Standard void reasons for shipments.
 */
export const VOID_REASONS = [
  'Shipped to wrong address',
  'Items damaged before shipping',
  'Customer cancelled after ship',
  'Duplicate shipment',
  'Data entry error',
  'Other',
] as const

export type VoidReason = (typeof VOID_REASONS)[number]

/**
 * Input for voiding a shipment.
 */
export interface VoidShipmentInput {
  shipmentId: string
  reason: VoidReason
  notes?: string
}

/**
 * Result from voidShipment action.
 */
export interface VoidShipmentResult {
  success: boolean
  error?: string
}

/**
 * Input for adding an order item.
 */
export interface AddOrderItemInput {
  orderId: string
  sku: string
  quantity: number
  price: number
  notes?: string
}

/**
 * Result from addOrderItem action.
 */
export interface AddOrderItemResult {
  success: boolean
  itemId?: string
  error?: string
}

/**
 * Input for updating an order item.
 */
export interface UpdateOrderItemInput {
  itemId: string
  quantity?: number
  price?: number
  notes?: string
}

/**
 * Result from updateOrderItem action.
 */
export interface UpdateOrderItemResult {
  success: boolean
  error?: string
}

/**
 * Result from removeOrderItem action.
 */
export interface RemoveOrderItemResult {
  success: boolean
  error?: string
}

/**
 * Result from cancelOrderItem action.
 */
export interface CancelOrderItemResult {
  success: boolean
  error?: string
}

/**
 * Result from bulkCancelItems action.
 */
export interface BulkCancelResult {
  success: boolean
  cancelledCount?: number
  error?: string
}

/**
 * Input for resending shipment emails.
 */
export interface ResendShipmentEmailInput {
  shipmentId: string
  recipient: 'customer' | 'rep'
  includeTracking: boolean
  attachInvoice: boolean
}

/**
 * Result from resendShipmentEmail action.
 */
export interface ResendShipmentEmailResult {
  success: boolean
  error?: string
}
