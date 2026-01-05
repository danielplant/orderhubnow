/**
 * Orders queries - data layer for admin and rep orders pages
 * Matches .NET CustomersOrders.aspx and RepOrders.aspx behavior
 */

import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import type {
  AdminOrderRow,
  OrdersListInput,
  OrdersListResult,
  OrderStatus,
  OrdersSortColumn,
  SortDirection,
} from '@/lib/types/order';

// ============================================================================
// Rep Orders Types
// ============================================================================

/**
 * Order row for rep view - extends admin row with category field.
 */
export interface RepOrderRow extends AdminOrderRow {
  category: string; // Comma-separated category names
}

/**
 * Result shape from getOrdersByRep query.
 */
export interface RepOrdersListResult {
  orders: RepOrderRow[];
  total: number;
  statusCounts: Record<'All' | OrderStatus, number>;
}

// ============================================================================
// Helpers
// ============================================================================

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

/**
 * Parse Next.js searchParams into typed OrdersListInput.
 * Supports `?syncStatus=pending` for Dashboard integration.
 */
export function parseOrdersListInput(
  searchParams: Record<string, string | string[] | undefined>
): OrdersListInput {
  // Handle both string and string[] (Next.js can return either)
  const getParam = (key: string): string | undefined => {
    const val = searchParams[key];
    return Array.isArray(val) ? val[0] : val;
  };

  const status = getString(getParam('status'));
  const q = getString(getParam('q'));
  const rep = getString(getParam('rep'));
  const syncStatus = getString(getParam('syncStatus'));
  const dateFrom = getString(getParam('dateFrom'));
  const dateTo = getString(getParam('dateTo'));
  const sort = (getString(getParam('sort')) as OrdersSortColumn | undefined) ?? 'orderDate';
  const dir = (getString(getParam('dir')) as SortDirection | undefined) ?? 'desc';
  const page = toInt(getParam('page'), 1);
  const pageSize = toInt(getParam('pageSize'), 50);

  return {
    status: (status as OrdersListInput['status']) || 'All',
    q,
    rep,
    syncStatus: syncStatus === 'pending' ? 'pending' : undefined,
    dateFrom,
    dateTo,
    sort,
    dir,
    page,
    pageSize,
  };
}

function buildOrderBy(sort: OrdersSortColumn, dir: SortDirection) {
  const direction = dir === 'asc' ? 'asc' : 'desc';
  switch (sort) {
    case 'storeName':
      return { StoreName: direction } as const;
    case 'orderNumber':
      return { OrderNumber: direction } as const;
    case 'orderAmount':
      return { OrderAmount: direction } as const;
    case 'shipStartDate':
      return { ShipStartDate: direction } as const;
    case 'orderDate':
    default:
      return { OrderDate: direction } as const;
  }
}

// ============================================================================
// Main Query
// ============================================================================

/**
 * Get paginated, filtered, sorted orders for admin list view.
 * 
 * @param searchParams - Raw searchParams from Next.js page
 * @returns Orders list with total count and status counts for tabs
 */
export async function getOrders(
  searchParams: Record<string, string | string[] | undefined>
): Promise<OrdersListResult> {
  const input = parseOrdersListInput(searchParams);

  // Build base where clause (applies to all queries)
  // Uses AND array to combine multiple filter conditions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseWhere: any = { AND: [] };

  // Enhanced multi-field search - searches across order number, store name, email, buyer name, and PO
  if (input.q) {
    baseWhere.AND.push({
      OR: [
        { OrderNumber: { contains: input.q, mode: 'insensitive' } },
        { StoreName: { contains: input.q, mode: 'insensitive' } },
        { CustomerEmail: { contains: input.q, mode: 'insensitive' } },
        { BuyerName: { contains: input.q, mode: 'insensitive' } },
        { CustomerPO: { contains: input.q, mode: 'insensitive' } },
      ],
    });
  }

  // Optional rep filter (enhancement; CustomerOrders.SalesRep is a string)
  if (input.rep) {
    baseWhere.AND.push({ SalesRep: { contains: input.rep, mode: 'insensitive' } });
  }

  // CRITICAL: Pending sync filter must handle nullable boolean
  // IsTransferredToShopify = false OR null means "not synced"
  if (input.syncStatus === 'pending') {
    baseWhere.AND.push({
      OR: [
        { IsTransferredToShopify: false },
        { IsTransferredToShopify: null },
      ],
    });
  }

  // Date range filter on OrderDate
  if (input.dateFrom || input.dateTo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateFilter: any = {};
    if (input.dateFrom) {
      // Start of the day in local timezone
      dateFilter.gte = new Date(input.dateFrom + 'T00:00:00');
    }
    if (input.dateTo) {
      // End of the day in local timezone (23:59:59.999)
      dateFilter.lte = new Date(input.dateTo + 'T23:59:59.999');
    }
    baseWhere.AND.push({ OrderDate: dateFilter });
  }

  // Clean up empty AND array (Prisma doesn't like empty AND)
  const finalBaseWhere = baseWhere.AND.length > 0 ? baseWhere : {};

  // Build status-specific where (for filtered list)
  const whereWithStatus =
    input.status && input.status !== 'All'
      ? { ...finalBaseWhere, OrderStatus: input.status }
      : finalBaseWhere;

  // Run queries in parallel
  const [total, orders, grouped] = await Promise.all([
    // Total count for current filter
    prisma.customerOrders.count({ where: whereWithStatus }),
    
    // Paginated data
    prisma.customerOrders.findMany({
      where: whereWithStatus,
      orderBy: buildOrderBy(input.sort ?? 'orderDate', input.dir ?? 'desc'),
      skip: (input.page! - 1) * input.pageSize!,
      take: input.pageSize!,
      select: {
        ID: true,
        OrderNumber: true,
        OrderStatus: true,
        StoreName: true,
        BuyerName: true,
        SalesRep: true,
        CustomerEmail: true,
        Country: true,
        OrderAmount: true,
        ShipStartDate: true,
        ShipEndDate: true,
        OrderDate: true,
        IsTransferredToShopify: true,
      },
    }),
    
    // Status counts for tabs (uses finalBaseWhere, not status-filtered)
    prisma.customerOrders.groupBy({
      by: ['OrderStatus'],
      where: finalBaseWhere,
      _count: { _all: true },
    }),
  ]);

  // Build status counts map
  const statusCounts: OrdersListResult['statusCounts'] = {
    All: grouped.reduce((sum, g) => sum + g._count._all, 0),
    Pending: 0,
    Processing: 0,
    Shipped: 0,
    Invoiced: 0,
    Cancelled: 0,
  };

  for (const g of grouped) {
    const key = g.OrderStatus as OrderStatus;
    if (key in statusCounts) {
      statusCounts[key] = g._count._all;
    }
  }

  // Map to frontend shape
  return {
    total,
    statusCounts,
    orders: orders.map((o) => ({
      id: String(o.ID),
      orderNumber: o.OrderNumber,
      status: o.OrderStatus as OrderStatus,
      storeName: o.StoreName,
      buyerName: o.BuyerName,
      salesRep: o.SalesRep,
      customerEmail: o.CustomerEmail,
      country: o.Country,
      orderAmount: o.OrderAmount,
      orderAmountFormatted: formatCurrency(
        o.OrderAmount,
        o.Country?.toUpperCase().includes('US') ? 'USD' : 'CAD'
      ),
      shipStartDate: o.ShipStartDate ? o.ShipStartDate.toISOString().slice(0, 10) : null,
      shipEndDate: o.ShipEndDate ? o.ShipEndDate.toISOString().slice(0, 10) : null,
      orderDate: o.OrderDate.toISOString().slice(0, 10),
      inShopify: !!o.IsTransferredToShopify,
      isTransferredToShopify: o.IsTransferredToShopify,
    })),
  };
}

// ============================================================================
// Supporting Queries
// ============================================================================

/**
 * Get reps list for filter/select dropdowns.
 * Uses Reps table; returns id, name, and code.
 * - name: matches CustomerOrders.SalesRep string
 * - code: matches Customers.Rep (with fallback to Name if Code is empty)
 */
export async function getRepsForFilter(): Promise<Array<{ id: string; name: string; code: string }>> {
  const reps = await prisma.reps.findMany({
    select: { ID: true, Name: true, Code: true },
    orderBy: { Name: 'asc' },
  });
  return reps.map((r) => ({
    id: String(r.ID),
    name: r.Name ?? '',
    code: r.Code?.trim() || r.Name || '',  // Fallback: Code empty -> use Name
  }));
}

/**
 * Get order items for a specific order.
 * Uses separate query since CustomerOrdersItems has no Prisma relation.
 */
export async function getOrderItems(orderId: string) {
  const items = await prisma.customerOrdersItems.findMany({
    where: { CustomerOrderID: BigInt(orderId) },
    select: {
      ID: true,
      SKU: true,
      Quantity: true,
      Price: true,
      PriceCurrency: true,
      Notes: true,
    },
    orderBy: { SKU: 'asc' },
  });

  return items.map((item) => ({
    id: String(item.ID),
    sku: item.SKU,
    quantity: item.Quantity,
    price: item.Price,
    currency: item.PriceCurrency,
    notes: item.Notes,
  }));
}

/**
 * Get a single order by ID.
 * Used for GET /api/orders/[id] endpoint.
 */
export async function getOrderById(orderId: string): Promise<AdminOrderRow | null> {
  const order = await prisma.customerOrders.findUnique({
    where: { ID: BigInt(orderId) },
    select: {
      ID: true,
      OrderNumber: true,
      OrderStatus: true,
      StoreName: true,
      BuyerName: true,
      SalesRep: true,
      CustomerEmail: true,
      Country: true,
      OrderAmount: true,
      ShipStartDate: true,
      ShipEndDate: true,
      OrderDate: true,
      IsTransferredToShopify: true,
    },
  });

  if (!order) {
    return null;
  }

  return {
    id: String(order.ID),
    orderNumber: order.OrderNumber,
    status: order.OrderStatus as OrderStatus,
    storeName: order.StoreName,
    buyerName: order.BuyerName,
    salesRep: order.SalesRep,
    customerEmail: order.CustomerEmail,
    country: order.Country,
    orderAmount: order.OrderAmount,
    orderAmountFormatted: formatCurrency(
      order.OrderAmount,
      order.Country?.toUpperCase().includes('US') ? 'USD' : 'CAD'
    ),
    shipStartDate: order.ShipStartDate ? order.ShipStartDate.toISOString().slice(0, 10) : null,
    shipEndDate: order.ShipEndDate ? order.ShipEndDate.toISOString().slice(0, 10) : null,
    orderDate: order.OrderDate.toISOString().slice(0, 10),
    inShopify: !!order.IsTransferredToShopify,
    isTransferredToShopify: order.IsTransferredToShopify,
  };
}

/**
 * Get comments for a specific order.
 * CustomerOrdersComments DOES have a relation to CustomerOrders.
 */
export async function getOrderComments(orderId: string) {
  const comments = await prisma.customerOrdersComments.findMany({
    where: { OrderID: BigInt(orderId) },
    select: {
      ID: true,
      Comments: true,
      AddedDate: true,
      AddedBy: true,
    },
    orderBy: { AddedDate: 'desc' },
  });

  return comments.map((c) => ({
    id: String(c.ID),
    text: c.Comments,
    createdAt: c.AddedDate.toISOString(),
    createdBy: c.AddedBy,
  }));
}

// ============================================================================
// Rep Orders Query
// ============================================================================

/**
 * Get category names for a batch of orders.
 * Matches .NET: foreach order item, look up SKU's category name.
 * Returns map of orderNumber -> comma-joined sorted category names.
 */
async function getOrderCategories(
  orderNumbers: string[]
): Promise<Map<string, string>> {
  if (orderNumbers.length === 0) {
    return new Map();
  }

  // Get all items for these orders
  const items = await prisma.customerOrdersItems.findMany({
    where: { OrderNumber: { in: orderNumbers } },
    select: { OrderNumber: true, SKU: true },
  });

  if (items.length === 0) {
    return new Map();
  }

  // Get unique SKUs
  const skuIds = [...new Set(items.map((i) => i.SKU).filter(Boolean))];

  // Look up SKUs with their categories
  const skus = await prisma.sku.findMany({
    where: { SkuID: { in: skuIds } },
    select: {
      SkuID: true,
      SkuCategories: { select: { Name: true } },
    },
  });

  // Build SKU -> category name map
  const skuToCategory = new Map<string, string>();
  for (const sku of skus) {
    if (sku.SkuCategories?.Name) {
      skuToCategory.set(sku.SkuID, sku.SkuCategories.Name);
    }
  }

  // Build orderNumber -> categories map
  const orderCategories = new Map<string, Set<string>>();
  for (const item of items) {
    const categoryName = skuToCategory.get(item.SKU);
    if (categoryName) {
      if (!orderCategories.has(item.OrderNumber)) {
        orderCategories.set(item.OrderNumber, new Set());
      }
      orderCategories.get(item.OrderNumber)!.add(categoryName);
    }
  }

  // Convert to comma-joined sorted strings
  const result = new Map<string, string>();
  for (const [orderNumber, categories] of orderCategories) {
    result.set(orderNumber, [...categories].sort().join(', '));
  }

  return result;
}

/**
 * Get paginated, filtered, sorted orders for rep list view.
 * Matches .NET RepOrders.aspx behavior:
 * - Filter by SalesRep contains rep's name (looked up by repId)
 * - Includes category column computed from order items
 *
 * @param repId - Rep ID from session (used to look up rep name)
 * @param searchParams - Filter/sort params from URL
 * @returns Orders list with total count and status counts for tabs
 */
export async function getOrdersByRep(
  repId: number,
  searchParams: Record<string, string | string[] | undefined>
): Promise<RepOrdersListResult> {
  // 1. Look up rep's name from Reps table
  const rep = await prisma.reps.findUnique({
    where: { ID: repId },
    select: { Name: true },
  });

  if (!rep?.Name) {
    return {
      total: 0,
      statusCounts: {
        All: 0,
        Pending: 0,
        Processing: 0,
        Shipped: 0,
        Invoiced: 0,
        Cancelled: 0,
      },
      orders: [],
    };
  }

  const input = parseOrdersListInput(searchParams);

  // 2. Build base where with rep filter using AND array for combining conditions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseWhere: any = {
    AND: [
      // Rep filter: RepID match (fast, indexed) OR SalesRep contains name (fallback for legacy)
      {
        OR: [
          { RepID: repId },
          { SalesRep: { contains: rep.Name, mode: 'insensitive' } },
        ],
      },
    ],
  };

  // Enhanced multi-field search - searches across order number, store name, email, buyer name
  if (input.q) {
    baseWhere.AND.push({
      OR: [
        { OrderNumber: { contains: input.q, mode: 'insensitive' } },
        { StoreName: { contains: input.q, mode: 'insensitive' } },
        { CustomerEmail: { contains: input.q, mode: 'insensitive' } },
        { BuyerName: { contains: input.q, mode: 'insensitive' } },
      ],
    });
  }

  // 3. Build status-specific where
  const whereWithStatus =
    input.status && input.status !== 'All'
      ? { ...baseWhere, OrderStatus: input.status }
      : baseWhere;

  // 4. Execute queries in parallel
  const [total, orders, grouped] = await Promise.all([
    prisma.customerOrders.count({ where: whereWithStatus }),
    prisma.customerOrders.findMany({
      where: whereWithStatus,
      orderBy: buildOrderBy(input.sort ?? 'orderDate', input.dir ?? 'desc'),
      skip: (input.page! - 1) * input.pageSize!,
      take: input.pageSize!,
      select: {
        ID: true,
        OrderNumber: true,
        OrderStatus: true,
        StoreName: true,
        BuyerName: true,
        SalesRep: true,
        CustomerEmail: true,
        Country: true,
        OrderAmount: true,
        ShipStartDate: true,
        ShipEndDate: true,
        OrderDate: true,
        IsTransferredToShopify: true,
      },
    }),
    prisma.customerOrders.groupBy({
      by: ['OrderStatus'],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  // 5. Build status counts map
  const statusCounts: RepOrdersListResult['statusCounts'] = {
    All: grouped.reduce((sum, g) => sum + g._count._all, 0),
    Pending: 0,
    Processing: 0,
    Shipped: 0,
    Invoiced: 0,
    Cancelled: 0,
  };

  for (const g of grouped) {
    const key = g.OrderStatus as OrderStatus;
    if (key in statusCounts) {
      statusCounts[key] = g._count._all;
    }
  }

  // 6. Get categories for these orders
  const orderNumbers = orders.map((o) => o.OrderNumber);
  const categoryMap = await getOrderCategories(orderNumbers);

  // 7. Map to frontend shape
  return {
    total,
    statusCounts,
    orders: orders.map((o) => ({
      id: String(o.ID),
      orderNumber: o.OrderNumber,
      status: o.OrderStatus as OrderStatus,
      storeName: o.StoreName,
      buyerName: o.BuyerName,
      salesRep: o.SalesRep,
      customerEmail: o.CustomerEmail,
      country: o.Country,
      orderAmount: o.OrderAmount,
      orderAmountFormatted: formatCurrency(
        o.OrderAmount,
        o.Country?.toUpperCase().includes('US') ? 'USD' : 'CAD'
      ),
      shipStartDate: o.ShipStartDate
        ? o.ShipStartDate.toISOString().slice(0, 10)
        : null,
      shipEndDate: o.ShipEndDate
        ? o.ShipEndDate.toISOString().slice(0, 10)
        : null,
      orderDate: o.OrderDate.toISOString().slice(0, 10),
      inShopify: !!o.IsTransferredToShopify,
      isTransferredToShopify: o.IsTransferredToShopify,
      category: categoryMap.get(o.OrderNumber) ?? '',
    })),
  };
}

// ============================================================================
// Order Editing Query
// ============================================================================

/**
 * Order data structure for editing.
 */
export interface OrderForEditing {
  id: string;
  orderNumber: string;
  status: string;
  storeName: string;
  buyerName: string;
  salesRep: string;
  salesRepId: string | null;
  customerEmail: string;
  customerPhone: string;
  currency: 'USD' | 'CAD';
  orderAmount: number;
  orderNotes: string;
  customerPO: string;
  shipStartDate: string;
  shipEndDate: string;
  orderDate: string;
  website: string;
  inShopify: boolean;
  items: Array<{
    id: string;
    sku: string;
    skuVariantId: number;
    quantity: number;
    price: number;
    currency: string;
    description: string;
  }>;
}

/**
 * Get order with items for editing.
 * Matches .NET MyOrder.aspx.cs Page_Load with Session["OrderToEdit"].
 *
 * @param orderId - Order ID to edit
 * @returns Order with items, or null if not found
 */
export async function getOrderForEditing(
  orderId: string
): Promise<OrderForEditing | null> {
  const order = await prisma.customerOrders.findUnique({
    where: { ID: BigInt(orderId) },
  });

  if (!order) {
    return null;
  }

  // Get order items
  const items = await prisma.customerOrdersItems.findMany({
    where: { CustomerOrderID: BigInt(orderId) },
    select: {
      ID: true,
      SKU: true,
      SKUVariantID: true,
      Quantity: true,
      Price: true,
      PriceCurrency: true,
    },
    orderBy: { SKU: 'asc' },
  });

  // Get SKU descriptions for display
  const skuIds = items.map((i) => i.SKU);
  const skus = await prisma.sku.findMany({
    where: { SkuID: { in: skuIds } },
    select: { SkuID: true, Description: true },
  });
  const skuDescMap = new Map(skus.map((s) => [s.SkuID, s.Description || '']));

  // Get rep ID - use stored RepID for new orders, fallback to name lookup for legacy
  let salesRepId: string | null = null;

  // Primary: use stored RepID (new orders with strong ownership)
  if (order.RepID) {
    salesRepId = String(order.RepID);
  }
  // Fallback: look up by name for legacy orders where RepID is null
  else if (order.SalesRep) {
    const rep = await prisma.reps.findFirst({
      where: { Name: order.SalesRep },
      select: { ID: true },
    });
    if (rep) {
      salesRepId = String(rep.ID);
    }
  }

  // Determine currency from Country field
  const currency: 'USD' | 'CAD' = order.Country?.toUpperCase().includes('US')
    ? 'USD'
    : 'CAD';

  return {
    id: String(order.ID),
    orderNumber: order.OrderNumber,
    status: order.OrderStatus,
    storeName: order.StoreName,
    buyerName: order.BuyerName,
    salesRep: order.SalesRep,
    salesRepId,
    customerEmail: order.CustomerEmail,
    customerPhone: order.CustomerPhone,
    currency,
    orderAmount: order.OrderAmount,
    orderNotes: order.OrderNotes || '',
    customerPO: order.CustomerPO || '',
    shipStartDate: order.ShipStartDate.toISOString().slice(0, 10),
    shipEndDate: order.ShipEndDate.toISOString().slice(0, 10),
    orderDate: order.OrderDate.toISOString().slice(0, 10),
    website: order.Website || '',
    inShopify: !!order.IsTransferredToShopify,
    items: items.map((item) => ({
      id: String(item.ID),
      sku: item.SKU,
      skuVariantId: Number(item.SKUVariantID),
      quantity: item.Quantity,
      price: item.Price,
      currency: item.PriceCurrency,
      description: skuDescMap.get(item.SKU) || '',
    })),
  };
}
