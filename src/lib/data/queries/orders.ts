/**
 * Orders queries - data layer for admin orders page
 * Matches .NET CustomersOrders.aspx behavior
 */

import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import type {
  OrdersListInput,
  OrdersListResult,
  OrderStatus,
  OrdersSortColumn,
  SortDirection,
} from '@/lib/types/order';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseWhere: any = {};

  // Store search - matches .NET: StoreName.ToLower().Contains(storeNameSearch)
  if (input.q) {
    baseWhere.StoreName = { contains: input.q, mode: 'insensitive' };
  }

  // Optional rep filter (enhancement; CustomerOrders.SalesRep is a string)
  if (input.rep) {
    baseWhere.SalesRep = { contains: input.rep, mode: 'insensitive' };
  }

  // CRITICAL: Pending sync filter must handle nullable boolean
  // IsTransferredToShopify = false OR null means "not synced"
  if (input.syncStatus === 'pending') {
    baseWhere.OR = [
      { IsTransferredToShopify: false },
      { IsTransferredToShopify: null },
    ];
  }

  // Date range filter on OrderDate
  if (input.dateFrom || input.dateTo) {
    baseWhere.OrderDate = {};
    if (input.dateFrom) {
      // Start of the day in local timezone
      baseWhere.OrderDate.gte = new Date(input.dateFrom + 'T00:00:00');
    }
    if (input.dateTo) {
      // End of the day in local timezone (23:59:59.999)
      baseWhere.OrderDate.lte = new Date(input.dateTo + 'T23:59:59.999');
    }
  }

  // Build status-specific where (for filtered list)
  const whereWithStatus =
    input.status && input.status !== 'All'
      ? { ...baseWhere, OrderStatus: input.status }
      : baseWhere;

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
    
    // Status counts for tabs (uses baseWhere, not status-filtered)
    prisma.customerOrders.groupBy({
      by: ['OrderStatus'],
      where: baseWhere,
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
 * Get reps list for filter dropdown.
 * Uses Reps table; returns name which matches CustomerOrders.SalesRep string.
 */
export async function getRepsForFilter(): Promise<Array<{ id: string; name: string }>> {
  const reps = await prisma.reps.findMany({
    select: { ID: true, Name: true },
    orderBy: { Name: 'asc' },
  });
  return reps.map((r) => ({ id: String(r.ID), name: r.Name }));
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
