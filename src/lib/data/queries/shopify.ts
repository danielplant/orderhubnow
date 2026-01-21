import { prisma } from '@/lib/prisma'
import { isShopifyConfigured } from '@/lib/shopify/client'
import type {
  ShopifySyncStatus,
  ShopifySyncHistoryEntry,
  MissingShopifySku,
  MissingSkusFilters,
  MissingSkusResult,
} from '@/lib/types/shopify'

// ============================================================================
// Sync Status
// ============================================================================

/**
 * Get current Shopify sync status.
 * Reads from database, not live API.
 */
export async function getSyncStatus(): Promise<ShopifySyncStatus> {
  const isConnected = isShopifyConfigured()

  // Count synced products (SKUs with ShopifyProductVariantId)
  const productsSynced = await prisma.sku.count({
    where: { ShopifyProductVariantId: { not: null } },
  })

  // Count synced customers
  const customersSynced = await prisma.customersFromShopify.count()

  // Count pending missing SKUs (not reviewed)
  const pendingSync = await prisma.missingShopifySkus.count({
    where: { IsReviewed: false },
  })

  // Get last sync log entry (per-SKU log)
  const lastSync = await prisma.shopifySyncLog.findFirst({
    orderBy: { SyncDataTime: 'desc' },
    select: { SyncDataTime: true },
  })

  // Also check the new ShopifySyncRun table for more accurate status
  const lastRun = await prisma.shopifySyncRun.findFirst({
    orderBy: { StartedAt: 'desc' },
    select: { Status: true, StartedAt: true, CompletedAt: true },
  })

  // Determine last sync status from both sources
  let lastSyncStatus: 'success' | 'partial' | 'failed' | 'never' = 'never'
  let lastSyncTime: Date | undefined = undefined

  if (lastRun) {
    // Prefer ShopifySyncRun for status if available
    lastSyncTime = lastRun.CompletedAt ?? lastRun.StartedAt
    if (lastRun.Status === 'completed') {
      lastSyncStatus = 'success'
    } else if (lastRun.Status === 'failed' || lastRun.Status === 'timeout') {
      lastSyncStatus = 'failed'
    } else if (lastRun.Status === 'started') {
      // Still in progress, use previous completed sync time if available
      lastSyncStatus = lastSync ? 'success' : 'never'
      lastSyncTime = lastSync?.SyncDataTime
    }
  } else if (lastSync) {
    // Fall back to ShopifySyncLog if no runs yet
    lastSyncTime = lastSync.SyncDataTime
    lastSyncStatus = 'success'
  }

  return {
    isConnected,
    lastSyncTime,
    lastSyncStatus,
    productsSynced,
    customersSynced,
    pendingSync,
  }
}

/**
 * Get sync history - last N sync sessions.
 * Uses ShopifySyncRun for run-level history, with fallback to ShopifySyncLog grouping.
 */
export async function getSyncHistory(limit = 5): Promise<ShopifySyncHistoryEntry[]> {
  // First, try to get history from the new ShopifySyncRun table
  const runs = await prisma.shopifySyncRun.findMany({
    orderBy: { StartedAt: 'desc' },
    take: limit,
    select: {
      StartedAt: true,
      CompletedAt: true,
      Status: true,
      ItemCount: true,
      SyncType: true,
    },
  })

  if (runs.length > 0) {
    return runs.map((run) => ({
      syncTime: run.CompletedAt ?? run.StartedAt,
      itemCount: run.ItemCount ?? 0,
      status:
        run.Status === 'completed'
          ? ('completed' as const)
          : run.Status === 'started'
            ? ('in_progress' as const)
            : ('failed' as const),
      syncType: run.SyncType as 'scheduled' | 'on-demand',
    }))
  }

  // Fallback: Group ShopifySyncLog entries by SyncDataTime (legacy behavior)
  const syncSessions = await prisma.shopifySyncLog.groupBy({
    by: ['SyncDataTime'],
    _count: { _all: true },
    orderBy: { SyncDataTime: 'desc' },
    take: limit,
  })

  return syncSessions.map((session) => ({
    syncTime: session.SyncDataTime,
    itemCount: session._count._all,
    status: 'completed' as const,
  }))
}

// ============================================================================
// Missing SKUs
// ============================================================================

/**
 * Get missing Shopify SKUs with filtering and pagination.
 * Uses MissingShopifySkus table with IsReviewed for status.
 */
export async function getMissingSkus(
  filters?: MissingSkusFilters,
  page = 1,
  pageSize = 50
): Promise<MissingSkusResult> {
  const status = filters?.status ?? 'all'
  const search = filters?.search?.trim()

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereBase: any = {}

  if (status === 'pending') {
    whereBase.IsReviewed = false
  } else if (status === 'reviewed') {
    whereBase.IsReviewed = true
  }
  // 'all' means no IsReviewed filter

  if (search) {
    whereBase.OR = [
      { SkuID: { contains: search } },
      { Description: { contains: search } },
      { SkuColor: { contains: search } },
    ]
  }

  // Get counts for each status
  const [pendingCount, reviewedCount, totalCount] = await Promise.all([
    prisma.missingShopifySkus.count({ where: { ...whereBase, IsReviewed: false } }),
    prisma.missingShopifySkus.count({ where: { ...whereBase, IsReviewed: true } }),
    prisma.missingShopifySkus.count({ where: whereBase }),
  ])

  // Get paginated data
  const skip = (page - 1) * pageSize
  const rows = await prisma.missingShopifySkus.findMany({
    where: whereBase,
    orderBy: { DateAdded: 'desc' },
    skip,
    take: pageSize,
  })

  const skus: MissingShopifySku[] = rows.map((r) => ({
    id: String(r.ID),
    skuId: r.SkuID,
    description: r.Description,
    quantity: r.Quantity,
    price: r.Price,
    priceCAD: r.PriceCAD,
    priceUSD: r.PriceUSD,
    fabricContent: r.FabricContent,
    skuColor: r.SkuColor,
    season: r.Season,
    categoryId: r.CategoryID,
    orderEntryDescription: r.OrderEntryDescription,
    msrpCAD: r.MSRPCAD,
    msrpUSD: r.MSRPUSD,
    dateAdded: r.DateAdded,
    dateModified: r.DateModified,
    isReviewed: r.IsReviewed,
    shopifyProductVariantId: r.ShopifyProductVariantId ? String(r.ShopifyProductVariantId) : undefined,
  }))

  return {
    skus,
    total: totalCount,
    statusCounts: {
      pending: pendingCount,
      reviewed: reviewedCount,
      all: pendingCount + reviewedCount,
    },
  }
}

// ============================================================================
// Orders Pending Transfer
// ============================================================================

/**
 * Get orders that haven't been transferred to Shopify.
 */
export async function getOrdersPendingTransfer(
  page = 1,
  pageSize = 50
): Promise<{
  orders: Array<{
    id: string
    orderNumber: string
    storeName: string
    orderAmount: number
    orderDate: Date
    salesRep: string
  }>
  total: number
}> {
  const where = {
    IsTransferredToShopify: { not: true },
  }

  const [total, rows] = await Promise.all([
    prisma.customerOrders.count({ where }),
    prisma.customerOrders.findMany({
      where,
      orderBy: { OrderDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        ID: true,
        OrderNumber: true,
        StoreName: true,
        OrderAmount: true,
        OrderDate: true,
        SalesRep: true,
      },
    }),
  ])

  return {
    orders: rows.map((r) => ({
      id: String(r.ID),
      orderNumber: r.OrderNumber,
      storeName: r.StoreName,
      orderAmount: r.OrderAmount,
      orderDate: r.OrderDate,
      salesRep: r.SalesRep,
    })),
    total,
  }
}

// ============================================================================
// Raw Shopify SKUs (for variant matching)
// ============================================================================

/**
 * Find a Shopify variant by stored variant ID or SKU substring fallback.
 * Mirrors .NET logic: first match by ShopifyId, then by SKU substring.
 */
export async function findShopifyVariant(
  skuVariantId: bigint | null,
  skuCode: string
): Promise<{
  id: number
  shopifyId: bigint | null
  skuId: string
  displayName: string
  price: number
  weightInGrams: number | null
  productStatus: string | null
} | null> {
  // First: try to match by exact ShopifyId (variant ID stored on order item)
  if (skuVariantId && skuVariantId > BigInt(0)) {
    const exact = await prisma.rawSkusFromShopify.findFirst({
      where: { ShopifyId: skuVariantId },
    })
    if (exact && exact.ShopifyId) {
      return {
        id: exact.ID,
        shopifyId: exact.ShopifyId,
        skuId: exact.SkuID,
        displayName: exact.DisplayName,
        price: exact.Price,
        weightInGrams: exact.VariantWeightInGrams ?? null,
        productStatus: exact.ProductStatus ?? null,
      }
    }
  }

  // Fallback: match by SKU substring (removing prefix)
  // .NET does: rs.SkuID.EndsWith(cOrderItem.SKU.Substring(2))
  // Then:      rs.SkuID.EndsWith(cOrderItem.SKU.Substring(3))
  if (skuCode.length > 2) {
    const suffix2 = skuCode.substring(2)
    const match2 = await prisma.rawSkusFromShopify.findFirst({
      where: {
        SkuID: { endsWith: suffix2 },
        ShopifyId: { not: null },
      },
    })
    if (match2 && match2.ShopifyId) {
      return {
        id: match2.ID,
        shopifyId: match2.ShopifyId,
        skuId: match2.SkuID,
        displayName: match2.DisplayName,
        price: match2.Price,
        weightInGrams: match2.VariantWeightInGrams ?? null,
        productStatus: match2.ProductStatus ?? null,
      }
    }
  }

  if (skuCode.length > 3) {
    const suffix3 = skuCode.substring(3)
    const match3 = await prisma.rawSkusFromShopify.findFirst({
      where: {
        SkuID: { endsWith: suffix3 },
        ShopifyId: { not: null },
      },
    })
    if (match3 && match3.ShopifyId) {
      return {
        id: match3.ID,
        shopifyId: match3.ShopifyId,
        skuId: match3.SkuID,
        displayName: match3.DisplayName,
        price: match3.Price,
        weightInGrams: match3.VariantWeightInGrams ?? null,
        productStatus: match3.ProductStatus ?? null,
      }
    }
  }

  return null
}

// ============================================================================
// Shopify Customer Lookup
// ============================================================================

/**
 * Find a Shopify customer by email in our local cache.
 */
export async function findCachedShopifyCustomer(
  email: string
): Promise<{ id: bigint; shopifyId: string } | null> {
  const customer = await prisma.customersFromShopify.findFirst({
    where: { Email: email },
  })

  if (!customer) return null

  return {
    id: customer.ID,
    shopifyId: customer.ShopifyID,
  }
}
