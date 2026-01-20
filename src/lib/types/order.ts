/**
 * Order-related domain types.
 */

/**
 * Mapping of variant SKU to order quantity.
 * (Used by buyer/cart flow; keep for backwards compatibility.)
 */
export interface OrderQuantities {
  [sku: string]: number;
}

// ============================================================================
// Admin Orders Domain Types
// ============================================================================

/**
 * Valid order statuses matching .NET CustomerOrders.OrderStatus values.
 * 'Draft' is used for server-side cart persistence before submission.
 * 'Partially Shipped' indicates some items shipped but not all.
 */
export const ORDER_STATUSES = [
  'Draft',
  'Pending',
  'Processing',
  'Partially Shipped',
  'Shipped',
  'Invoiced',
  'Cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Sortable columns for admin orders list.
 */
export type OrdersSortColumn =
  | 'orderDate'
  | 'storeName'
  | 'orderNumber'
  | 'orderAmount'
  | 'shipStartDate';

export type SortDirection = 'asc' | 'desc';

/**
 * Flattened order row for admin list view.
 * IDs are serialized as strings for React + JSON safety (DB uses BigInt).
 */
export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  storeName: string;
  buyerName: string;
  salesRep: string;
  customerEmail: string;
  country: string;
  orderAmount: number;
  orderAmountFormatted: string;
  shipStartDate: string | null;
  shipEndDate: string | null;
  orderDate: string;
  inShopify: boolean;
  isTransferredToShopify: boolean | null;
  // Shopify status fields (synced from Shopify)
  shopifyFulfillmentStatus: string | null;
  shopifyFinancialStatus: string | null;
  // Shipment summary fields (optional - populated when shipments exist)
  shippedTotal: number | null;
  shippedTotalFormatted: string | null;
  variance: number | null;
  varianceFormatted: string | null;
  trackingCount: number;
  trackingNumbers: string[];
  // Enhanced fields for Orders Dashboard
  collection: string | null;        // Derived collection from order items
  season: string | null;            // Derived from ship window (SS26, FW26)
  notes: string | null;             // Shipping notes / variance explanation (BrandNotes field)
  syncError: string | null;         // Error message if Shopify sync failed
}

/**
 * Result shape from getOrders query.
 */
export interface OrdersListResult {
  orders: AdminOrderRow[];
  total: number;
  statusCounts: Record<'All' | OrderStatus, number>;
}

/**
 * Input parameters for orders list query (maps from URL searchParams).
 */
export interface OrdersListInput {
  status?: 'All' | OrderStatus;
  q?: string;
  rep?: string;
  syncStatus?: 'pending';
  dateFrom?: string; // ISO date string (YYYY-MM-DD)
  dateTo?: string;   // ISO date string (YYYY-MM-DD)
  sort?: OrdersSortColumn;
  dir?: SortDirection;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// Order Action Types (used by server actions)
// ============================================================================

/**
 * Result shape from createOrder action.
 */
export interface CreateOrderResult {
  success: boolean
  orderId?: string
  orderNumber?: string
  error?: string
}

/**
 * Input for updating an existing order.
 */
export interface UpdateOrderInput {
  orderId: string
  storeName: string
  buyerName: string
  salesRepId: string
  customerEmail: string
  customerPhone: string
  currency: 'USD' | 'CAD'
  shipStartDate: string
  shipEndDate: string
  orderNotes?: string
  customerPO?: string
  website?: string
  items: Array<{
    sku: string
    skuVariantId: number
    quantity: number
    price: number
  }>
}

/**
 * Result shape from updateOrder action.
 */
export interface UpdateOrderResult {
  success: boolean
  orderNumber?: string
  error?: string
}
