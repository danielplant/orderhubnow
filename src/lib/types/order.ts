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
  // Order type - derived from SkuCategories.IsPreOrder at creation
  isPreOrder: boolean;              // true = Pre-Order (P prefix), false = ATS (A prefix)
  // Enhanced fields for Orders Dashboard
  collection: string | null;        // Derived OHN collection from order items (Sku.CollectionID)
  shopifyCollectionRaw: string | null; // Raw Shopify collection value (from ShopifyValueMapping.rawValue)
  season: string | null;            // Derived from ship window (SS26, FW26)
  notes: string | null;             // Shipping notes / variance explanation (BrandNotes field)
  syncError: string | null;         // Error message if Shopify sync failed
  // Phase 5: Planned shipments count for orders with multiple ship windows
  plannedShipmentCount: number;
  // First planned shipment date for timeline display
  firstShipmentDate: string | null;
  // Aggregate fulfillment status across planned shipments (null if no shipments)
  shipmentFulfillmentStatus: 'Planned' | 'PartiallyFulfilled' | 'Fulfilled' | 'Mixed' | null;
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
 * View mode for orders list (active, archived, or trashed).
 */
export type ViewMode = 'active' | 'archived' | 'trashed'

/**
 * Input parameters for orders list query (maps from URL searchParams).
 */
export interface OrdersListInput {
  status?: 'All' | OrderStatus;
  q?: string;
  rep?: string;
  syncStatus?: 'pending';
  orderType?: 'ATS' | 'Pre-Order';
  season?: string;      // e.g., 'SS26', 'FW25'
  collection?: string;  // Collection name
  dateFrom?: string; // ISO date string (YYYY-MM-DD)
  dateTo?: string;   // ISO date string (YYYY-MM-DD)
  sort?: OrdersSortColumn;
  dir?: SortDirection;
  page?: number;
  pageSize?: number;
  viewMode?: ViewMode;  // Filter by active/archived/trashed
}

/**
 * Facet counts for filter dropdowns.
 * Static counts from unfiltered totals (excluding Draft orders).
 */
export interface OrderFacets {
  types: Array<{ value: 'ATS' | 'Pre-Order'; count: number }>;
  seasons: Array<{ value: string; count: number }>;
  collections: Array<{ value: string; count: number }>;
  reps: Array<{ value: string; count: number }>;
}

/**
 * Counts for archive/trash view mode tabs.
 */
export interface ArchiveTrashCounts {
  active: number;
  archived: number;
  trashed: number;
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
  orders?: Array<{
    orderId: string
    orderNumber: string
    collectionName: string | null
    shipWindowStart: string | null
    shipWindowEnd: string | null
    orderAmount?: number
  }>
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

// ============================================================================
// Status Change Types (for Shopify sync)
// ============================================================================

/**
 * Re-export ShopifyCancelReason for convenience.
 * See src/lib/shopify/client.ts for the actual type definition.
 */
export type { ShopifyCancelReason } from '@/lib/shopify/client'

/**
 * Options for changing order status with optional Shopify sync.
 */
export interface StatusChangeOptions {
  /** Cancellation reason (required for Shopify orders being cancelled) */
  cancelReason?: import('@/lib/shopify/client').ShopifyCancelReason
  /** Whether to notify customer via Shopify email (default: true) */
  notifyCustomer?: boolean
  /** Whether to restock inventory in Shopify (default: true) */
  restockInventory?: boolean
  /** Skip Shopify sync (for retry scenarios or non-Shopify orders) */
  skipShopifySync?: boolean
}

/**
 * Result from a status change operation with Shopify sync info.
 */
export interface StatusChangeResult {
  success: boolean
  error?: string
  /** Details about the Shopify sync attempt (only for Shopify orders) */
  shopifySync?: {
    /** Whether a sync was attempted */
    attempted: boolean
    /** Whether the sync succeeded */
    success: boolean
    /** Error message if sync failed */
    error?: string
  }
}
