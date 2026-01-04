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
 */
export const ORDER_STATUSES = [
  'Pending',
  'Processing',
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
