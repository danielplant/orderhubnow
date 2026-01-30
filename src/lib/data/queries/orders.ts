/**
 * Orders queries - data layer for admin and rep orders pages
 * Matches .NET CustomersOrders.aspx and RepOrders.aspx behavior
 */

import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import type {
  AdminOrderRow,
  OrderFacets,
  OrdersListInput,
  OrdersListResult,
  OrderStatus,
  OrdersSortColumn,
  SortDirection,
} from '@/lib/types/order';
import { getShipmentSummariesForOrders } from '@/lib/data/actions/shipments';

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
  const orderType = getString(getParam('orderType'));
  const season = getString(getParam('season'));
  const collection = getString(getParam('collection'));
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
    orderType: orderType === 'ATS' || orderType === 'Pre-Order' ? orderType : undefined,
    season,
    collection,
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

  // Multi-field search - matches OrderNumber, StoreName, SalesRep, CustomerEmail
  // Note: SQL Server collation is case-insensitive by default
  if (input.q) {
    const searchConditions = {
      OR: [
        { OrderNumber: { contains: input.q } },
        { StoreName: { contains: input.q } },
        { SalesRep: { contains: input.q } },
        { CustomerEmail: { contains: input.q } },
      ],
    };
    baseWhere.AND = baseWhere.AND
      ? [...baseWhere.AND, searchConditions]
      : [searchConditions];
  }

  // Optional rep filter (enhancement; CustomerOrders.SalesRep is a string)
  // Note: SQL Server collation is case-insensitive by default
  if (input.rep) {
    baseWhere.SalesRep = { contains: input.rep };
  }

  // CRITICAL: Pending sync filter must handle nullable boolean
  // IsTransferredToShopify = false OR null means "not synced"
  // Uses AND pattern to combine with other filters
  if (input.syncStatus === 'pending') {
    const syncConditions = {
      OR: [
        { IsTransferredToShopify: false },
        { IsTransferredToShopify: null },
      ],
    };
    baseWhere.AND = baseWhere.AND
      ? [...baseWhere.AND, syncConditions]
      : [syncConditions];
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

  // Type filter (ATS vs Pre-Order)
  if (input.orderType) {
    const typeCondition = {
      IsPreOrder: input.orderType === 'Pre-Order',
    };
    baseWhere.AND = baseWhere.AND
      ? [...baseWhere.AND, typeCondition]
      : [typeCondition];
  }

  // Season filter - derives date range from season code (SS26 = Jan-Jun 2026, FW25 = Jul-Dec 2025)
  if (input.season) {
    const match = input.season.match(/^(SS|FW)(\d{2})$/);
    if (match) {
      const [, prefix, yearShort] = match;
      const year = 2000 + parseInt(yearShort);
      const startMonth = prefix === 'SS' ? 1 : 7;
      const endMonth = prefix === 'SS' ? 6 : 12;
      const seasonCondition = {
        ShipStartDate: {
          gte: new Date(year, startMonth - 1, 1),
          lte: new Date(year, endMonth, 0), // Last day of end month
        },
      };
      baseWhere.AND = baseWhere.AND
        ? [...baseWhere.AND, seasonCondition]
        : [seasonCondition];
    }
  }

  // Collection filter - requires raw SQL subquery since CustomerOrdersItems.SKU is a string, not a relation
  // Finds order IDs that have at least one item from the specified collection
  if (input.collection) {
    const orderIdsWithCollection = await prisma.$queryRaw<Array<{ ID: bigint }>>`
      SELECT DISTINCT o.ID
      FROM CustomerOrders o
      JOIN CustomerOrdersItems i ON o.ID = i.CustomerOrderID
      JOIN Sku s ON i.SKU = s.SkuID
      JOIN Collection c ON s.CollectionID = c.ID
      WHERE c.Name = ${input.collection}
    `;
    const ids = orderIdsWithCollection.map(r => r.ID);
    if (ids.length > 0) {
      baseWhere.AND = baseWhere.AND
        ? [...baseWhere.AND, { ID: { in: ids } }]
        : [{ ID: { in: ids } }];
    } else {
      // No orders match this collection - force empty result
      baseWhere.AND = baseWhere.AND
        ? [...baseWhere.AND, { ID: { equals: BigInt(-1) } }]
        : [{ ID: { equals: BigInt(-1) } }];
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
        IsPreOrder: true,  // Order type from SKU category
        ShopifyFulfillmentStatus: true,
        ShopifyFinancialStatus: true,
        BrandNotes: true,  // Used for shipping notes / variance explanations
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
    Draft: 0,
    Pending: 0,
    Processing: 0,
    'Partially Shipped': 0,
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

  // Get shipment summaries and collections for these orders
  const orderIds = orders.map((o) => String(o.ID));
  const orderNumbers = orders.map((o) => o.OrderNumber);
  const orderBigIntIds = orders.map((o) => o.ID);
  const [shipmentSummaries, collectionMap, shopifyRawCollectionMap, plannedShipmentCounts] = await Promise.all([
    getShipmentSummariesForOrders(orderIds),
    getOrderCollections(orderNumbers),
    getShopifyRawCollections(orderNumbers),
    // Phase 5: Get planned shipment counts for each order
    prisma.plannedShipment.groupBy({
      by: ['CustomerOrderID'],
      where: { CustomerOrderID: { in: orderBigIntIds } },
      _count: { ID: true },
    }),
  ]);

  // Phase 5: Build planned shipment count map
  const plannedCountMap = new Map(
    plannedShipmentCounts.map((s) => [String(s.CustomerOrderID), s._count.ID])
  );

  // Map to frontend shape
  return {
    total,
    statusCounts,
    orders: orders.map((o) => {
      const orderId = String(o.ID);
      const summary = shipmentSummaries.get(orderId);
      const currency = o.Country?.toUpperCase().includes('US') ? 'USD' : 'CAD';

      // Calculate variance if shipments exist
      let shippedTotal: number | null = null;
      let variance: number | null = null;
      let varianceFormatted: string | null = null;

      if (summary) {
        shippedTotal = summary.totalShipped;
        variance = summary.totalShipped - o.OrderAmount;
        const sign = variance >= 0 ? '+' : '';
        varianceFormatted = `${sign}${formatCurrency(variance, currency)}`;
      }

      return {
        id: orderId,
        orderNumber: o.OrderNumber,
        status: o.OrderStatus as OrderStatus,
        storeName: o.StoreName,
        buyerName: o.BuyerName,
        salesRep: o.SalesRep,
        customerEmail: o.CustomerEmail,
        country: o.Country,
        orderAmount: o.OrderAmount,
        orderAmountFormatted: formatCurrency(o.OrderAmount, currency),
        shipStartDate: o.ShipStartDate ? o.ShipStartDate.toISOString().slice(0, 10) : null,
        shipEndDate: o.ShipEndDate ? o.ShipEndDate.toISOString().slice(0, 10) : null,
        orderDate: o.OrderDate.toISOString().slice(0, 10),
        inShopify: !!o.IsTransferredToShopify,
        isTransferredToShopify: o.IsTransferredToShopify,
        // Shopify status fields
        shopifyFulfillmentStatus: o.ShopifyFulfillmentStatus,
        shopifyFinancialStatus: o.ShopifyFinancialStatus,
        // Shipment summary fields
        shippedTotal,
        shippedTotalFormatted: shippedTotal !== null ? formatCurrency(shippedTotal, currency) : null,
        variance,
        varianceFormatted,
        trackingCount: summary?.trackingCount ?? 0,
        trackingNumbers: summary?.trackingNumbers ?? [],
        // Enhanced fields for Orders Dashboard
        collection: collectionMap.get(o.OrderNumber) ?? null,
        shopifyCollectionRaw: shopifyRawCollectionMap.get(o.OrderNumber) ?? null,
        season: deriveSeasonFromShipDate(o.ShipStartDate),
        notes: o.BrandNotes ?? null,
        syncError: null,   // TODO: Add SyncError field to schema if needed
        // Order type - derived from SkuCategories.IsPreOrder at creation
        isPreOrder: o.IsPreOrder ?? o.OrderNumber.startsWith('P'),
        // Phase 5: Planned shipments count for orders with multiple ship windows
        plannedShipmentCount: plannedCountMap.get(orderId) ?? 0,
      };
    }),
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
      IsPreOrder: true,
      ShopifyFulfillmentStatus: true,
      ShopifyFinancialStatus: true,
    },
  });

  if (!order) {
    return null;
  }

  // Get shipment summary for this order
  const shipmentSummaries = await getShipmentSummariesForOrders([orderId]);
  const summary = shipmentSummaries.get(orderId);
  const currency = order.Country?.toUpperCase().includes('US') ? 'USD' : 'CAD';

  // Phase 5: Get planned shipment count
  const plannedShipmentCount = await prisma.plannedShipment.count({
    where: { CustomerOrderID: BigInt(orderId) },
  });

  // Calculate variance if shipments exist
  let shippedTotal: number | null = null;
  let variance: number | null = null;
  let varianceFormatted: string | null = null;

  if (summary) {
    shippedTotal = summary.totalShipped;
    variance = summary.totalShipped - order.OrderAmount;
    const sign = variance >= 0 ? '+' : '';
    varianceFormatted = `${sign}${formatCurrency(variance, currency)}`;
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
    orderAmountFormatted: formatCurrency(order.OrderAmount, currency),
    shipStartDate: order.ShipStartDate ? order.ShipStartDate.toISOString().slice(0, 10) : null,
    shipEndDate: order.ShipEndDate ? order.ShipEndDate.toISOString().slice(0, 10) : null,
    orderDate: order.OrderDate.toISOString().slice(0, 10),
    inShopify: !!order.IsTransferredToShopify,
    isTransferredToShopify: order.IsTransferredToShopify,
    // Shopify status fields
    shopifyFulfillmentStatus: order.ShopifyFulfillmentStatus,
    shopifyFinancialStatus: order.ShopifyFinancialStatus,
    // Shipment summary fields
    shippedTotal,
    shippedTotalFormatted: shippedTotal !== null ? formatCurrency(shippedTotal, currency) : null,
    variance,
    varianceFormatted,
    trackingCount: summary?.trackingCount ?? 0,
    trackingNumbers: summary?.trackingNumbers ?? [],
    // Enhanced fields
    collection: null,
    shopifyCollectionRaw: null,
    season: deriveSeasonFromShipDate(order.ShipStartDate),
    notes: (order as { BrandNotes?: string | null }).BrandNotes ?? null,
    syncError: null,
    // Order type - derived from SkuCategories.IsPreOrder at creation
    isPreOrder: order.IsPreOrder ?? order.OrderNumber.startsWith('P'),
    // Phase 5: Planned shipments count
    plannedShipmentCount,
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
 * Get collection names for a batch of orders.
 * Returns single collection name if all items are from same collection, "Mixed" if multiple.
 */
async function getOrderCollections(
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

  // Look up SKUs with their Collection relation
  const skus = await prisma.sku.findMany({
    where: { SkuID: { in: skuIds } },
    select: {
      SkuID: true,
      Collection: { select: { name: true } },
    },
  });

  // Build SKU -> collection name map
  const skuToCollection = new Map<string, string>();
  for (const sku of skus) {
    if (sku.Collection?.name) {
      skuToCollection.set(sku.SkuID, sku.Collection.name);
    }
  }

  // Build orderNumber -> collections set map
  const orderCollections = new Map<string, Set<string>>();
  for (const item of items) {
    const collection = skuToCollection.get(item.SKU);
    if (collection) {
      if (!orderCollections.has(item.OrderNumber)) {
        orderCollections.set(item.OrderNumber, new Set());
      }
      orderCollections.get(item.OrderNumber)!.add(collection);
    }
  }

  // Convert to single collection or "Mixed"
  const result = new Map<string, string>();
  for (const [orderNumber, collections] of orderCollections) {
    if (collections.size === 1) {
      result.set(orderNumber, [...collections][0]);
    } else if (collections.size > 1) {
      result.set(orderNumber, 'Mixed');
    }
  }

  return result;
}

/**
 * Get Shopify raw collection values for a batch of orders.
 * Uses ShopifyValueMapping to reverse-map from CollectionID -> rawValue.
 * Returns single raw value if all items map to same value, "Mixed" if multiple.
 */
async function getShopifyRawCollections(
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

  // Look up SKUs with their CollectionID
  const skus = await prisma.sku.findMany({
    where: { SkuID: { in: skuIds } },
    select: {
      SkuID: true,
      CollectionID: true,
    },
  });

  // Get unique collection IDs
  const collectionIds = [...new Set(skus.map((s) => s.CollectionID).filter((id): id is number => id !== null))];

  if (collectionIds.length === 0) {
    return new Map();
  }

  // Get ShopifyValueMappings that are mapped to these collections
  const mappings = await prisma.shopifyValueMapping.findMany({
    where: {
      status: 'mapped',
      collectionId: { in: collectionIds },
    },
    select: {
      rawValue: true,
      collectionId: true,
    },
  });

  // Build collectionId -> rawValue map (may have multiple mappings per collection)
  const collectionToRawValues = new Map<number, string[]>();
  for (const m of mappings) {
    if (m.collectionId) {
      const existing = collectionToRawValues.get(m.collectionId) || [];
      existing.push(m.rawValue);
      collectionToRawValues.set(m.collectionId, existing);
    }
  }

  // Build SKU -> rawValues map
  const skuToRawValues = new Map<string, string[]>();
  for (const sku of skus) {
    if (sku.CollectionID) {
      const rawValues = collectionToRawValues.get(sku.CollectionID) || [];
      skuToRawValues.set(sku.SkuID, rawValues);
    }
  }

  // Build orderNumber -> rawValues set map
  const orderRawValues = new Map<string, Set<string>>();
  for (const item of items) {
    const rawValues = skuToRawValues.get(item.SKU) || [];
    for (const rv of rawValues) {
      if (!orderRawValues.has(item.OrderNumber)) {
        orderRawValues.set(item.OrderNumber, new Set());
      }
      orderRawValues.get(item.OrderNumber)!.add(rv);
    }
  }

  // Convert to single rawValue or "Mixed"
  const result = new Map<string, string>();
  for (const [orderNumber, rawValues] of orderRawValues) {
    if (rawValues.size === 1) {
      result.set(orderNumber, [...rawValues][0]);
    } else if (rawValues.size > 1) {
      result.set(orderNumber, 'Mixed');
    }
  }

  return result;
}

/**
 * Derive season code from ship start date.
 * SS = Spring/Summer (Jan-Jun), FW = Fall/Winter (Jul-Dec)
 */
function deriveSeasonFromShipDate(shipStartDate: Date | null): string | null {
  if (!shipStartDate) return null;
  const month = shipStartDate.getMonth() + 1; // 1-12
  const year = shipStartDate.getFullYear().toString().slice(-2); // "26"
  return month >= 1 && month <= 6 ? `SS${year}` : `FW${year}`;
}

// ============================================================================
// Order Facets (Filter Counts)
// ============================================================================

/**
 * Get season facet counts using raw SQL.
 * Season is derived from ShipStartDate, not stored - SQL grouping is efficient.
 * Excludes Draft orders.
 */
async function getSeasonFacets(): Promise<Array<{ value: string; count: number }>> {
  const results = await prisma.$queryRaw<Array<{ season: string; count: bigint }>>`
    SELECT
      CASE
        WHEN MONTH(ShipStartDate) BETWEEN 1 AND 6
        THEN CONCAT('SS', RIGHT(YEAR(ShipStartDate), 2))
        ELSE CONCAT('FW', RIGHT(YEAR(ShipStartDate), 2))
      END as season,
      COUNT(*) as count
    FROM CustomerOrders
    WHERE ShipStartDate IS NOT NULL
      AND OrderStatus NOT IN ('Draft')
    GROUP BY
      CASE
        WHEN MONTH(ShipStartDate) BETWEEN 1 AND 6
        THEN CONCAT('SS', RIGHT(YEAR(ShipStartDate), 2))
        ELSE CONCAT('FW', RIGHT(YEAR(ShipStartDate), 2))
      END
    ORDER BY season DESC
  `;
  return results
    .map((r) => ({ value: r.season, count: Number(r.count) }))
    .filter((r) => r.count > 0);
}

/**
 * Get collection facet counts using raw SQL.
 * Requires 3-table join (Orders → OrderItems → Sku → Collection).
 * Uses COUNT DISTINCT to get accurate order counts (not item counts).
 * Excludes Draft orders.
 */
async function getCollectionFacets(): Promise<Array<{ value: string; count: number }>> {
  const results = await prisma.$queryRaw<Array<{ collection: string; count: bigint }>>`
    SELECT c.Name as collection, COUNT(DISTINCT o.ID) as count
    FROM CustomerOrders o
    JOIN CustomerOrdersItems i ON o.ID = i.CustomerOrderID
    JOIN Sku s ON i.SKU = s.SkuID
    JOIN Collection c ON s.CollectionID = c.ID
    WHERE o.OrderStatus NOT IN ('Draft')
    GROUP BY c.Name
    ORDER BY c.Name
  `;
  return results
    .map((r) => ({ value: r.collection, count: Number(r.count) }))
    .filter((r) => r.count > 0);
}

/**
 * Get all order facets for filter dropdowns.
 * Returns static counts from unfiltered totals (excluding Draft orders).
 * Uses parallel queries for performance.
 */
export async function getOrderFacets(): Promise<OrderFacets> {
  const [typeCounts, seasonCounts, collectionCounts, repCounts] = await Promise.all([
    // Type facets (ATS vs Pre-Order) using Prisma groupBy
    prisma.customerOrders.groupBy({
      by: ['IsPreOrder'],
      _count: { _all: true },
      where: { OrderStatus: { notIn: ['Draft'] } },
    }),
    // Season facets (raw SQL for derived field)
    getSeasonFacets(),
    // Collection facets (raw SQL for 3-table join)
    getCollectionFacets(),
    // Rep facets using Prisma groupBy
    prisma.customerOrders.groupBy({
      by: ['SalesRep'],
      _count: { _all: true },
      where: {
        SalesRep: { not: '' },
        OrderStatus: { notIn: ['Draft'] },
      },
      orderBy: { SalesRep: 'asc' },
    }),
  ]);

  // Build type facets - map IsPreOrder boolean to user-friendly labels
  const atsCount = typeCounts.find((t) => t.IsPreOrder === false)?._count?._all ?? 0;
  const preOrderCount = typeCounts.find((t) => t.IsPreOrder === true)?._count?._all ?? 0;

  return {
    types: [
      { value: 'ATS' as const, count: atsCount },
      { value: 'Pre-Order' as const, count: preOrderCount },
    ].filter((t) => t.count > 0),
    seasons: seasonCounts,
    collections: collectionCounts,
    reps: repCounts
      .filter((r) => r.SalesRep && r._count?._all && r._count._all > 0)
      .map((r) => ({ value: r.SalesRep!, count: r._count!._all! })),
  };
}

// ============================================================================
// Rep Orders Query
// ============================================================================

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
        Draft: 0,
        Pending: 0,
        Processing: 0,
        'Partially Shipped': 0,
        Shipped: 0,
        Invoiced: 0,
        Cancelled: 0,
      },
      orders: [],
    };
  }

  const input = parseOrdersListInput(searchParams);

  // 2. Build base where with rep filter
  // Uses OR to support both new orders (with RepID) and legacy orders (SalesRep string match)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseWhere: any = {
    // Rep filter: RepID match (fast, indexed) OR SalesRep contains name (fallback for legacy)
    // Note: SQL Server collation is case-insensitive by default, no mode needed
    OR: [
      { RepID: repId },
      { SalesRep: { contains: rep.Name } },
    ],
  };

  // Multi-field search filter (AND with the OR above)
  // Note: SQL Server collation is case-insensitive by default
  if (input.q) {
    const searchConditions = {
      OR: [
        { OrderNumber: { contains: input.q } },
        { StoreName: { contains: input.q } },
        { CustomerEmail: { contains: input.q } },
      ],
    };
    baseWhere.AND = baseWhere.AND
      ? [...baseWhere.AND, searchConditions]
      : [searchConditions];
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
        IsPreOrder: true,
        ShopifyFulfillmentStatus: true,
        ShopifyFinancialStatus: true,
        BrandNotes: true,
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
    Draft: 0,
    Pending: 0,
    Processing: 0,
    'Partially Shipped': 0,
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

  // 6. Get categories, collections, and shipment summaries for these orders
  const orderNumbers = orders.map((o) => o.OrderNumber);
  const orderIds = orders.map((o) => String(o.ID));
  const orderBigIntIds = orders.map((o) => o.ID);
  const [categoryMap, collectionMap, shopifyRawCollectionMap, shipmentSummaries, plannedShipmentCounts] = await Promise.all([
    getOrderCategories(orderNumbers),
    getOrderCollections(orderNumbers),
    getShopifyRawCollections(orderNumbers),
    getShipmentSummariesForOrders(orderIds),
    // Phase 5: Get planned shipment counts for each order
    prisma.plannedShipment.groupBy({
      by: ['CustomerOrderID'],
      where: { CustomerOrderID: { in: orderBigIntIds } },
      _count: { ID: true },
    }),
  ]);

  // Phase 5: Build planned shipment count map
  const plannedCountMap = new Map(
    plannedShipmentCounts.map((s) => [String(s.CustomerOrderID), s._count.ID])
  );

  // 8. Map to frontend shape
  return {
    total,
    statusCounts,
    orders: orders.map((o) => {
      const orderId = String(o.ID);
      const summary = shipmentSummaries.get(orderId);
      const currency = o.Country?.toUpperCase().includes('US') ? 'USD' : 'CAD';

      // Calculate variance if shipments exist
      let shippedTotal: number | null = null;
      let variance: number | null = null;
      let varianceFormatted: string | null = null;

      if (summary) {
        shippedTotal = summary.totalShipped;
        variance = summary.totalShipped - o.OrderAmount;
        const sign = variance >= 0 ? '+' : '';
        varianceFormatted = `${sign}${formatCurrency(variance, currency)}`;
      }

      return {
        id: orderId,
        orderNumber: o.OrderNumber,
        status: o.OrderStatus as OrderStatus,
        storeName: o.StoreName,
        buyerName: o.BuyerName,
        salesRep: o.SalesRep,
        customerEmail: o.CustomerEmail,
        country: o.Country,
        orderAmount: o.OrderAmount,
        orderAmountFormatted: formatCurrency(o.OrderAmount, currency),
        shipStartDate: o.ShipStartDate
          ? o.ShipStartDate.toISOString().slice(0, 10)
          : null,
        shipEndDate: o.ShipEndDate
          ? o.ShipEndDate.toISOString().slice(0, 10)
          : null,
        orderDate: o.OrderDate.toISOString().slice(0, 10),
        inShopify: !!o.IsTransferredToShopify,
        isTransferredToShopify: o.IsTransferredToShopify,
        // Shopify status fields
        shopifyFulfillmentStatus: o.ShopifyFulfillmentStatus,
        shopifyFinancialStatus: o.ShopifyFinancialStatus,
        category: categoryMap.get(o.OrderNumber) ?? '',
        // Shipment summary fields
        shippedTotal,
        shippedTotalFormatted: shippedTotal !== null ? formatCurrency(shippedTotal, currency) : null,
        variance,
        varianceFormatted,
        trackingCount: summary?.trackingCount ?? 0,
        trackingNumbers: summary?.trackingNumbers ?? [],
        // Enhanced fields
        collection: collectionMap.get(o.OrderNumber) ?? null,
        shopifyCollectionRaw: shopifyRawCollectionMap.get(o.OrderNumber) ?? null,
        season: deriveSeasonFromShipDate(o.ShipStartDate),
        notes: o.BrandNotes ?? null,
        syncError: null,
        // Order type - derived from SkuCategories.IsPreOrder at creation
        isPreOrder: o.IsPreOrder ?? o.OrderNumber.startsWith('P'),
        // Phase 5: Planned shipments count for orders with multiple ship windows
        plannedShipmentCount: plannedCountMap.get(orderId) ?? 0,
      };
    }),
  };
}

// ============================================================================
// Order Editing Query
// ============================================================================

/**
 * Order data structure for editing.
 * 
 * Phase 5: Added plannedShipments array to load existing PlannedShipment
 * records when entering edit mode. This allows the cart UI to display
 * shipments with their saved dates instead of recalculating defaults.
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
  isPreOrder: boolean;
  items: Array<{
    id: string;
    sku: string;
    skuVariantId: number;
    quantity: number;
    price: number;
    currency: string;
    description: string;
  }>;
  // Phase 5: Planned shipments for edit mode
  plannedShipments: Array<{
    id: string;
    collectionId: number | null;
    collectionName: string | null;
    plannedShipStart: string;  // ISO date (YYYY-MM-DD)
    plannedShipEnd: string;
    itemSkus: string[];  // SKUs in this shipment
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
  // Only return orders that are still editable (Draft or Pending)
  // This matches the validation in /api/orders/[id]/exists
  const order = await prisma.customerOrders.findUnique({
    where: {
      ID: BigInt(orderId),
      OrderStatus: { in: ['Draft', 'Pending'] },
    },
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

  // Phase 5: Fetch planned shipments for edit mode
  const plannedShipments = await prisma.plannedShipment.findMany({
    where: { CustomerOrderID: BigInt(orderId) },
    select: {
      ID: true,
      CollectionID: true,
      CollectionName: true,
      PlannedShipStart: true,
      PlannedShipEnd: true,
      Items: {
        select: { SKU: true },
      },
    },
    orderBy: { PlannedShipStart: 'asc' },
  });

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
    // Use stored IsPreOrder, fallback to order number prefix for legacy orders
    isPreOrder: order.IsPreOrder ?? order.OrderNumber.startsWith('P'),
    items: items.map((item) => ({
      id: String(item.ID),
      sku: item.SKU,
      skuVariantId: Number(item.SKUVariantID),
      quantity: item.Quantity,
      price: item.Price,
      currency: item.PriceCurrency,
      description: skuDescMap.get(item.SKU) || '',
    })),
    // Phase 5: Planned shipments for edit mode
    plannedShipments: plannedShipments.map((ps) => ({
      id: String(ps.ID),
      collectionId: ps.CollectionID,
      collectionName: ps.CollectionName,
      plannedShipStart: ps.PlannedShipStart.toISOString().slice(0, 10),
      plannedShipEnd: ps.PlannedShipEnd.toISOString().slice(0, 10),
      itemSkus: ps.Items.map((i) => i.SKU),
    })),
  };
}

// ============================================================================
// Planned Shipments Query
// ============================================================================

import type { PlannedShipmentDisplay, ShipmentStatus } from '@/lib/types/planned-shipment';

/**
 * Get planned shipments for an order with their items.
 * Includes collection window constraints for validation.
 */
export async function getPlannedShipmentsForOrder(
  orderId: string
): Promise<PlannedShipmentDisplay[]> {
  const shipments = await prisma.plannedShipment.findMany({
    where: { CustomerOrderID: BigInt(orderId) },
    select: {
      ID: true,
      CollectionID: true,
      CollectionName: true,
      PlannedShipStart: true,
      PlannedShipEnd: true,
      Status: true,
      Items: {
        select: {
          ID: true,
          SKU: true,
          Quantity: true,
          CancelledQty: true, // Phase 6: Include for remaining calculation
          Price: true,
          PriceCurrency: true,
        },
      },
    },
    orderBy: { PlannedShipStart: 'asc' },
  });

  // Batch fetch collection constraints
  const collectionIds = shipments
    .map((s) => s.CollectionID)
    .filter((id): id is number => id !== null);

  const collections = collectionIds.length > 0
    ? await prisma.collection.findMany({
        where: { id: { in: collectionIds } },
        select: { id: true, shipWindowStart: true, shipWindowEnd: true },
      })
    : [];

  const collectionMap = new Map(collections.map((c) => [c.id, c]));

  // Batch fetch SKU descriptions
  const allSkus = [...new Set(shipments.flatMap((s) => s.Items.map((i) => i.SKU)))];
  const skuRecords = allSkus.length > 0
    ? await prisma.sku.findMany({
        where: { SkuID: { in: allSkus } },
        select: { SkuID: true, Description: true },
      })
    : [];
  const skuDescMap = new Map(skuRecords.map((s) => [s.SkuID, s.Description || '']));

  // Phase 6: Batch fetch shipped quantities for all items (N+1 fix)
  const allItemIds = shipments.flatMap((s) => s.Items.map((i) => i.ID));
  const shipmentItemsData = allItemIds.length > 0
    ? await prisma.shipmentItems.findMany({
        where: {
          OrderItemID: { in: allItemIds },
          Shipment: { VoidedAt: null }, // Exclude voided shipments
        },
        select: {
          OrderItemID: true,
          QuantityShipped: true,
        },
      })
    : [];

  // Build lookup map for shipped quantities
  const shippedByItem = new Map<string, number>();
  for (const si of shipmentItemsData) {
    const key = String(si.OrderItemID);
    shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + si.QuantityShipped);
  }

  return shipments.map((s) => {
    const collection = s.CollectionID ? collectionMap.get(s.CollectionID) : null;
    const items = s.Items.map((item) => {
      // Phase 6: Calculate real fulfillment values
      const shippedQty = shippedByItem.get(String(item.ID)) ?? 0;
      const cancelledQty = item.CancelledQty ?? 0; // Defensive null handling
      const remainingQty = Math.max(0, item.Quantity - shippedQty - cancelledQty);

      return {
        orderItemId: String(item.ID),
        sku: item.SKU,
        description: skuDescMap.get(item.SKU) || '',
        quantity: item.Quantity,
        quantityFulfilled: shippedQty,
        quantityRemaining: remainingQty,
        price: item.Price,
        lineTotal: item.Price * item.Quantity,
        collectionId: s.CollectionID,
        collectionName: s.CollectionName,
      };
    });

    return {
      id: String(s.ID),
      collectionId: s.CollectionID,
      collectionName: s.CollectionName ?? 'Available to Ship',
      plannedShipStart: s.PlannedShipStart.toISOString().slice(0, 10),
      plannedShipEnd: s.PlannedShipEnd.toISOString().slice(0, 10),
      status: s.Status as ShipmentStatus,
      itemCount: items.length,
      subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
      items,
      itemIds: s.Items.map((i) => String(i.ID)), // Phase 6: For collection filtering
      // Collection constraints for validation
      minAllowedStart: collection?.shipWindowStart?.toISOString().slice(0, 10) ?? null,
      minAllowedEnd: collection?.shipWindowEnd?.toISOString().slice(0, 10) ?? null,
    };
  });
}
