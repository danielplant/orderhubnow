import { prisma } from '@/lib/prisma'
import { parsePrice, getBaseSku } from '@/lib/utils'
import { sortBySize, loadSizeOrderConfig, loadSizeAliasConfig } from '@/lib/utils/size-sort'
import { getIncomingMapForSkus } from '@/lib/data/queries/availability-settings'
import {
  computeAvailabilityDisplayFromRules,
  loadDisplayRulesData,
} from '@/lib/availability/compute'
import type { Product, ProductVariant } from '@/lib/types'
import type {
  Collection,
  CollectionWithCount,
  CollectionsGrouped,
  ShopifyValueMapping,
  ShopifyValueMappingWithCollection,
  MappingStats,
  CollectionType,
  MappingStatus,
} from '@/lib/types/collection'
import type { AffectedOrder, AffectedOrdersResult } from '@/lib/types/planned-shipment'

// ============================================================================
// Collection Queries
// ============================================================================

/**
 * Get all collections grouped by type (3 categories)
 */
export async function getCollectionsGrouped(): Promise<CollectionsGrouped> {
  const collections = await prisma.collection.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { skus: true } },
    },
  })

  const mapped = collections.map(mapCollectionWithCount)

  return {
    preorderNoPo: mapped.filter((c) => c.type === 'preorder_no_po'),
    preorderPo: mapped.filter((c) => c.type === 'preorder_po'),
    ats: mapped.filter((c) => c.type === 'ats'),
  }
}

/**
 * Get all collections with SKU counts
 */
export async function getCollectionsWithCount(): Promise<CollectionWithCount[]> {
  const collections = await prisma.collection.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { skus: true } },
    },
  })

  return collections.map(mapCollectionWithCount)
}

/**
 * Get collections by type
 */
export async function getCollectionsByType(
  type: CollectionType
): Promise<CollectionWithCount[]> {
  const collections = await prisma.collection.findMany({
    where: { type, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { skus: true } },
    },
  })

  return collections.map(mapCollectionWithCount)
}

/**
 * Get a single collection by ID
 */
export async function getCollectionById(
  id: number
): Promise<CollectionWithCount | null> {
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: {
      _count: { select: { skus: true } },
    },
  })

  if (!collection) return null
  return mapCollectionWithCount(collection)
}

/**
 * Get all collections (including inactive) for admin
 */
export async function getAllCollections(): Promise<CollectionWithCount[]> {
  const collections = await prisma.collection.findMany({
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    include: {
      _count: { select: { skus: true } },
    },
  })

  return collections.map(mapCollectionWithCount)
}

/**
 * Get all collections grouped by type (including inactive) for admin
 */
export async function getAllCollectionsGrouped(): Promise<CollectionsGrouped> {
  const collections = await prisma.collection.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { skus: true } },
    },
  })

  const mapped = collections.map(mapCollectionWithCount)

  return {
    preorderNoPo: mapped.filter((c) => c.type === 'preorder_no_po'),
    preorderPo: mapped.filter((c) => c.type === 'preorder_po'),
    ats: mapped.filter((c) => c.type === 'ats'),
  }
}

// ============================================================================
// Shopify Value Mapping Queries
// ============================================================================

/**
 * Get all Shopify value mappings with optional status filter
 */
export async function getShopifyMappings(
  status?: MappingStatus
): Promise<ShopifyValueMappingWithCollection[]> {
  const mappings = await prisma.shopifyValueMapping.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ skuCount: 'desc' }, { rawValue: 'asc' }],
    include: {
      collection: true,
    },
  })

  return mappings.map(mapShopifyMappingWithCollection)
}

/**
 * Get mapping statistics
 */
export async function getMappingStats(): Promise<MappingStats> {
  const [total, mapped, unmapped, deferred, unmappedSkuSum] = await Promise.all([
    prisma.shopifyValueMapping.count(),
    prisma.shopifyValueMapping.count({ where: { status: 'mapped' } }),
    prisma.shopifyValueMapping.count({ where: { status: 'unmapped' } }),
    prisma.shopifyValueMapping.count({ where: { status: 'deferred' } }),
    prisma.shopifyValueMapping.aggregate({
      where: { status: 'unmapped' },
      _sum: { skuCount: true },
    }),
  ])

  return {
    total,
    mapped,
    unmapped,
    deferred,
    unmappedSkuCount: unmappedSkuSum._sum.skuCount || 0,
  }
}

/**
 * Get a single mapping by ID
 */
export async function getMappingById(
  id: number
): Promise<ShopifyValueMappingWithCollection | null> {
  const mapping = await prisma.shopifyValueMapping.findUnique({
    where: { id },
    include: { collection: true },
  })

  if (!mapping) return null
  return mapShopifyMappingWithCollection(mapping)
}

// ============================================================================
// Raw SKU Preview Queries
// ============================================================================

/**
 * Raw SKU preview record from RawSkusFromShopify table
 */
export interface RawSkuPreview {
  skuId: string
  displayName: string
  productType: string | null
  imageUrl: string | null
  quantity: number
  size: string
  priceCAD: string | null
  priceUSD: string | null
  rawCollectionValue: string | null
}

/**
 * Get raw SKUs from RawSkusFromShopify that match a specific raw collection value.
 * Uses LIKE with comma-padding to handle comma-separated collection values.
 * This approach works on all SQL Server versions (doesn't require STRING_SPLIT).
 *
 * @param rawValue - The exact raw Shopify collection value to match
 * @param limit - Maximum number of results (default 100)
 * @param offset - Pagination offset (default 0)
 */
export async function getRawSkusByCollectionValue(
  rawValue: string,
  limit = 100,
  offset = 0
): Promise<{ skus: RawSkuPreview[]; total: number }> {
  // Build search patterns for LIKE matching
  // We pad both the column and search value with commas to ensure exact matches
  // e.g., searching for "SWIM" in "ATS, SWIM, PreOrder" becomes:
  // ',ATS, SWIM, PreOrder,' LIKE '%,SWIM,%' OR '%,SWIM ,%' (with/without trailing space)
  const searchPattern = `%,${rawValue},%`
  const searchPatternWithSpace = `%, ${rawValue},%`
  const searchPatternTrailingSpace = `%,${rawValue} ,%`

  // Count total matching SKUs
  const countResult = await prisma.$queryRaw<[{ count: number }]>`
    SELECT COUNT(*) as count
    FROM RawSkusFromShopify r
    WHERE r.metafield_order_entry_collection IS NOT NULL
      AND (
        ',' + REPLACE(r.metafield_order_entry_collection, ' ', '') + ',' LIKE ${searchPattern.replace(/ /g, '')}
        OR ',' + r.metafield_order_entry_collection + ',' LIKE ${searchPattern}
        OR ',' + r.metafield_order_entry_collection + ',' LIKE ${searchPatternWithSpace}
        OR ',' + r.metafield_order_entry_collection + ',' LIKE ${searchPatternTrailingSpace}
      )
  `
  const total = Number(countResult[0]?.count ?? 0)

  // Fetch paginated results
  const rows = await prisma.$queryRaw<Array<{
    SkuID: string
    DisplayName: string | null
    ProductType: string | null
    ShopifyProductImageURL: string | null
    Quantity: number | null
    Size: string | null
    metafield_cad_ws_price_test: string | null
    metafield_usd_ws_price: string | null
    metafield_order_entry_collection: string | null
  }>>`
    SELECT r.SkuID, r.DisplayName, r.ProductType, r.ShopifyProductImageURL,
           r.Quantity, r.Size, r.metafield_cad_ws_price_test, r.metafield_usd_ws_price,
           r.metafield_order_entry_collection
    FROM RawSkusFromShopify r
    WHERE r.metafield_order_entry_collection IS NOT NULL
      AND (
        ',' + REPLACE(r.metafield_order_entry_collection, ' ', '') + ',' LIKE ${searchPattern.replace(/ /g, '')}
        OR ',' + r.metafield_order_entry_collection + ',' LIKE ${searchPattern}
        OR ',' + r.metafield_order_entry_collection + ',' LIKE ${searchPatternWithSpace}
        OR ',' + r.metafield_order_entry_collection + ',' LIKE ${searchPatternTrailingSpace}
      )
    ORDER BY r.SkuID
    OFFSET ${offset} ROWS
    FETCH NEXT ${limit} ROWS ONLY
  `

  const skus: RawSkuPreview[] = rows.map((r) => ({
    skuId: r.SkuID,
    displayName: r.DisplayName ?? r.SkuID,
    productType: r.ProductType,
    imageUrl: r.ShopifyProductImageURL,
    quantity: r.Quantity ?? 0,
    size: r.Size ?? '',
    priceCAD: r.metafield_cad_ws_price_test,
    priceUSD: r.metafield_usd_ws_price,
    rawCollectionValue: r.metafield_order_entry_collection,
  }))

  return { skus, total }
}

// ============================================================================
// Mappers
// ============================================================================

type PrismaCollection = NonNullable<
  Awaited<ReturnType<typeof prisma.collection.findUnique>>
>
type PrismaCollectionWithCount = PrismaCollection & {
  _count: { skus: number }
}
type PrismaMapping = NonNullable<
  Awaited<ReturnType<typeof prisma.shopifyValueMapping.findUnique>>
>
type PrismaMappingWithCollection = PrismaMapping & {
  collection: PrismaCollection | null
}

function mapCollection(c: PrismaCollection): Collection {
  return {
    id: c.id,
    name: c.name,
    type: c.type as CollectionType,
    sortOrder: c.sortOrder,
    imageUrl: c.imageUrl,
    shipWindowStart: c.shipWindowStart?.toISOString() ?? null,
    shipWindowEnd: c.shipWindowEnd?.toISOString() ?? null,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

function mapCollectionWithCount(c: PrismaCollectionWithCount): CollectionWithCount {
  return {
    ...mapCollection(c),
    skuCount: c._count.skus,
  }
}

function mapShopifyMapping(m: PrismaMapping): ShopifyValueMapping {
  return {
    id: m.id,
    rawValue: m.rawValue,
    collectionId: m.collectionId,
    status: m.status as MappingStatus,
    note: m.note,
    skuCount: m.skuCount,
    firstSeenAt: m.firstSeenAt.toISOString(),
    lastSeenAt: m.lastSeenAt.toISOString(),
  }
}

function mapShopifyMappingWithCollection(
  m: PrismaMappingWithCollection
): ShopifyValueMappingWithCollection {
  return {
    ...mapShopifyMapping(m),
    collection: m.collection ? mapCollection(m.collection) : null,
  }
}

// ============================================================================
// Buyer-Facing Queries (for /buyer/* pages)
// ============================================================================

/**
 * Buyer-facing type for ATS collections list
 * Compatible with existing CategoryWithCount structure
 */
export interface BuyerCollection {
  id: number
  name: string
  isPreOrder: boolean
  productCount: number
  imageUrl: string | null
}

/**
 * Buyer-facing type for PreOrder collections list
 */
export interface BuyerPreOrderCollection extends BuyerCollection {
  onRouteStartDate: string | null
  onRouteEndDate: string | null
  type: 'preorder_no_po' | 'preorder_po'
}

/**
 * Get ATS collections for buyer page
 * Returns collections with product count, ordered by admin-defined sort order
 */
export async function getATSCollectionsForBuyer(): Promise<BuyerCollection[]> {
  const collections = await prisma.collection.findMany({
    where: { type: 'ats', isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { skus: true } },
    },
  })

  return collections
    .filter((c) => c._count.skus > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      isPreOrder: false,
      productCount: c._count.skus,
      imageUrl: c.imageUrl,
    }))
}

/**
 * Get PreOrder collections for buyer page
 * Returns collections with product count and ship window dates
 */
export async function getPreOrderCollectionsForBuyer(): Promise<BuyerPreOrderCollection[]> {
  const collections = await prisma.collection.findMany({
    where: { type: { in: ['preorder_no_po', 'preorder_po'] }, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { skus: true } },
    },
  })

  return collections
    .filter((c) => c._count.skus > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      isPreOrder: true,
      productCount: c._count.skus,
      imageUrl: c.imageUrl,
      onRouteStartDate: c.shipWindowStart?.toISOString() ?? null,
      onRouteEndDate: c.shipWindowEnd?.toISOString() ?? null,
      type: c.type as 'preorder_no_po' | 'preorder_po',
    }))
}

/**
 * Get collection name by ID
 */
export async function getCollectionName(collectionId: number): Promise<string | null> {
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { name: true },
  })
  return collection?.name ?? null
}

/**
 * Get SKUs by collection ID, grouped into Products
 * Equivalent to getSkusByCategory but uses CollectionID
 *
 * Grouping: Uses ShopifyProductId (Shopify product GID) as the stable grouping key.
 * Size: Uses Sku.Size (variant metafield only, no title fallback).
 * Color: Uses Sku.SkuColor (product metafield only, no fallback).
 * Image: Uses product-level image (canonical, not per-variant).
 */
export async function getSkusByCollection(collectionId: number): Promise<Product[]> {
  const skus = await prisma.sku.findMany({
    where: {
      CollectionID: collectionId,
      OR: [
        { Quantity: { gte: 1 } },
        { OnRoute: { gt: 0 } },
      ],
    },
    orderBy: [
      { DisplayPriority: 'asc' },
      { SkuID: 'asc' },
    ],
  })

  const displayRulesData = await loadDisplayRulesData()
  const incomingMap = await getIncomingMapForSkus(skus.map((sku) => sku.SkuID))

  // Group SKUs by ShopifyProductId (stable product-level key)
  const grouped = new Map<string, Array<typeof skus[0] & { baseSku: string; size: string }>>()

  for (const sku of skus) {
    const baseSku = getBaseSku(sku.SkuID, sku.Size)
    const size = sku.Size || ''
    const skuWithParsed = { ...sku, baseSku, size }

    // Use ShopifyProductId as group key; fall back to baseSku if not available
    const groupKey = sku.ShopifyProductId ?? baseSku

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, [])
    }
    grouped.get(groupKey)!.push(skuWithParsed)
  }

  // Load size order and alias config from DB before sorting
  await Promise.all([loadSizeOrderConfig(), loadSizeAliasConfig()])

  // Transform each group into a Product
  const products: Product[] = []

  for (const [groupKey, skuGroup] of grouped) {
    const first = skuGroup[0]
    const baseSku = first.baseSku

    const variants: ProductVariant[] = sortBySize(
      await Promise.all(skuGroup.map(async (sku) => {
        const incomingEntry = incomingMap.get(sku.SkuID)
        const incoming = incomingEntry?.incoming ?? null
        const committed = incomingEntry?.committed ?? null
        const onHand = incomingEntry?.onHand ?? null
        const displayResult = await computeAvailabilityDisplayFromRules(
          'ats',
          'buyer_ats',
          { quantity: sku.Quantity ?? 0, incoming, committed, onHand },
          displayRulesData
        )

        return {
          size: sku.size,
          sku: sku.SkuID,
          available: sku.Quantity ?? 0,
          onRoute: sku.OnRoute ?? 0,
          availableDisplay: displayResult.display,
          priceCad: parsePrice(sku.PriceCAD),
          priceUsd: parsePrice(sku.PriceUSD),
        }
      }))
    )

    const title = first.OrderEntryDescription ?? first.Description ?? baseSku
    products.push({
      id: groupKey,
      skuBase: baseSku,
      title,
      fabric: first.FabricContent ?? '',
      // Color: product metafield only, no fallback
      color: (first.SkuColor || '').trim(),
      productType: first.ProductType ?? '',
      priceCad: parsePrice(first.PriceCAD),
      priceUsd: parsePrice(first.PriceUSD),
      msrpCad: parsePrice(first.MSRPCAD),
      msrpUsd: parsePrice(first.MSRPUSD),
      imageUrl: first.ShopifyImageURL ?? '',
      thumbnailPath: first.ThumbnailPath ?? null,
      variants,
    })
  }

  return products
}

/**
 * Get PreOrder products by collection ID (line sheet/catalog - no stock filter)
 *
 * Grouping: Uses ShopifyProductId (Shopify product GID) as the stable grouping key.
 * Size: Uses Sku.Size (variant metafield only, no title fallback).
 * Color: Uses Sku.SkuColor (product metafield only, no fallback).
 * Image: Uses product-level image (canonical, not per-variant).
 */
export async function getPreOrderProductsByCollection(collectionId: number): Promise<Product[]> {
  // Fetch collection to get its type for availability scenario
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { type: true },
  })
  const collectionType = collection?.type ?? 'preorder_no_po'

  const skus = await prisma.sku.findMany({
    where: {
      CollectionID: collectionId,
    },
    orderBy: [
      { DisplayPriority: 'asc' },
      { SkuID: 'asc' },
    ],
  })

  const displayRulesData = await loadDisplayRulesData()
  const incomingMap = await getIncomingMapForSkus(skus.map((sku) => sku.SkuID))

  // Group SKUs by ShopifyProductId (stable product-level key)
  const grouped = new Map<string, Array<typeof skus[0] & { baseSku: string; size: string }>>()

  for (const sku of skus) {
    const baseSku = getBaseSku(sku.SkuID, sku.Size)
    const size = sku.Size || ''
    const skuWithParsed = { ...sku, baseSku, size }

    // Use ShopifyProductId as group key; fall back to baseSku if not available
    const groupKey = sku.ShopifyProductId ?? baseSku

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, [])
    }
    grouped.get(groupKey)!.push(skuWithParsed)
  }

  // Load size order and alias config from DB before sorting
  await Promise.all([loadSizeOrderConfig(), loadSizeAliasConfig()])

  // Transform each group into a Product
  const products: Product[] = []

  for (const [groupKey, skuGroup] of grouped) {
    const first = skuGroup[0]
    const baseSku = first.baseSku

    const variants: ProductVariant[] = sortBySize(
      await Promise.all(skuGroup.map(async (sku) => {
        const incomingEntry = incomingMap.get(sku.SkuID)
        const incoming = incomingEntry?.incoming ?? null
        const committed = incomingEntry?.committed ?? null
        const onHand = incomingEntry?.onHand ?? null
        const displayResult = await computeAvailabilityDisplayFromRules(
          collectionType,
          'buyer_preorder',
          { quantity: sku.Quantity ?? 0, incoming, committed, onHand },
          displayRulesData
        )

        return {
          size: sku.size,
          sku: sku.SkuID,
          available: sku.Quantity ?? 0,
          onRoute: sku.OnRoute ?? 0,
          availableDisplay: displayResult.display,
          priceCad: parsePrice(sku.PriceCAD),
          priceUsd: parsePrice(sku.PriceUSD),
        }
      }))
    )

    const title = first.OrderEntryDescription ?? first.Description ?? baseSku
    products.push({
      id: groupKey,
      skuBase: baseSku,
      title,
      fabric: first.FabricContent ?? '',
      // Color: product metafield only, no fallback
      color: (first.SkuColor || '').trim(),
      productType: first.ProductType ?? '',
      priceCad: parsePrice(first.PriceCAD),
      priceUsd: parsePrice(first.PriceUSD),
      msrpCad: parsePrice(first.MSRPCAD),
      msrpUsd: parsePrice(first.MSRPUSD),
      imageUrl: first.ShopifyImageURL ?? '',
      thumbnailPath: first.ThumbnailPath ?? null,
      variants,
    })
  }

  return products
}

/**
 * Get PreOrder collection by ID with ship window dates
 */
export async function getPreOrderCollectionById(collectionId: number): Promise<BuyerPreOrderCollection | null> {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, type: { in: ['preorder_no_po', 'preorder_po'] }, isActive: true },
    include: {
      _count: { select: { skus: true } },
    },
  })

  if (!collection) return null

  return {
    id: collection.id,
    name: collection.name,
    isPreOrder: true,
    productCount: collection._count.skus,
    imageUrl: collection.imageUrl,
    onRouteStartDate: collection.shipWindowStart?.toISOString() ?? null,
    onRouteEndDate: collection.shipWindowEnd?.toISOString() ?? null,
    type: collection.type as 'preorder_no_po' | 'preorder_po',
  }
}

// ============================================================================
// Affected Orders Query (for ship window changes)
// ============================================================================

/**
 * Find all orders/shipments affected by a collection ship window change.
 *
 * Uses two-step query pattern since CustomerOrdersItems.SKU is a string field,
 * not a relation to the Sku model.
 *
 * Only includes:
 * - PlannedShipments with Status = 'Planned' (not already fulfilled)
 * - Orders with OrderStatus = 'Pending' (not invoiced/cancelled)
 * - Orders not transferred to Shopify
 *
 * @param collectionId - The collection whose window is changing
 * @param newWindowStart - New ship window start date (YYYY-MM-DD)
 * @param newWindowEnd - New ship window end date (YYYY-MM-DD)
 */
export async function getAffectedOrdersByWindowChange(
  collectionId: number,
  newWindowStart: string,
  newWindowEnd: string
): Promise<AffectedOrdersResult> {
  // Step 0: Verify collection is PreOrder (ATS has no ship windows)
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { type: true },
  })
  const isPreOrder = collection?.type === 'preorder_no_po' || collection?.type === 'preorder_po'
  if (!isPreOrder) {
    return {
      affected: [],
      totalOrders: 0,
      totalShipments: 0,
      invalidCount: 0,
      shopifyExcludedCount: 0,
    }
  }

  // Step 1: Find SKU IDs in this collection
  const skusInCollection = await prisma.sku.findMany({
    where: { CollectionID: collectionId },
    select: { SkuID: true },
  })
  const skuIds = skusInCollection.map((s) => s.SkuID)

  if (skuIds.length === 0) {
    return {
      affected: [],
      totalOrders: 0,
      totalShipments: 0,
      invalidCount: 0,
      shopifyExcludedCount: 0,
    }
  }

  // Step 2: Find PlannedShipments with items using those SKUs
  // Only include shipments with Status = 'Planned' (exclude PartiallyFulfilled/Fulfilled)
  const shipments = await prisma.plannedShipment.findMany({
    where: {
      Items: { some: { SKU: { in: skuIds } } },
      Status: 'Planned', // Only unshipped shipments can have dates updated
    },
    select: {
      ID: true,
      CustomerOrderID: true,
      PlannedShipStart: true,
      PlannedShipEnd: true,
      Status: true,
      CustomerOrders: {
        select: {
          ID: true,
          OrderNumber: true,
          OrderStatus: true,
          IsTransferredToShopify: true,
          StoreName: true, // Direct string field
          CustomerEmail: true, // Direct string field
          SalesRep: true, // Direct string field (rep name)
          RepID: true, // FK for email lookup
        },
      },
      Items: {
        select: { ID: true, Quantity: true, Price: true },
        where: { SKU: { in: skuIds } },
      },
    },
  })

  // Step 3: Batch fetch rep emails for orders with RepID
  const repIds = [
    ...new Set(shipments.map((s) => s.CustomerOrders.RepID).filter(Boolean)),
  ] as number[]
  const reps =
    repIds.length > 0
      ? await prisma.reps.findMany({
          where: { ID: { in: repIds } },
          select: { ID: true, Email1: true },
        })
      : []
  const repEmailMap = new Map(reps.map((r) => [r.ID, r.Email1]))

  // Step 4: Filter and build affected list
  const newStart = new Date(newWindowStart)
  const newEnd = new Date(newWindowEnd)
  let shopifyExcludedCount = 0
  const affected: AffectedOrder[] = []

  for (const shipment of shipments) {
    const order = shipment.CustomerOrders

    // Skip non-pending orders
    if (order.OrderStatus !== 'Pending') continue

    // Count but exclude Shopify-transferred orders
    if (order.IsTransferredToShopify) {
      shopifyExcludedCount++
      continue
    }

    // Calculate validity
    const currentStart = shipment.PlannedShipStart
    const currentEnd = shipment.PlannedShipEnd
    const isStartInvalid = currentStart < newStart
    const isEndInvalid = currentEnd < newEnd
    const suggestedStart = isStartInvalid ? newStart : currentStart
    const suggestedEnd = isEndInvalid ? newEnd : currentEnd

    // Item stats for this collection only
    const itemCount = shipment.Items.length
    const subtotal = shipment.Items.reduce(
      (sum, i) => sum + i.Price * i.Quantity,
      0
    )

    affected.push({
      orderId: String(order.ID),
      orderNumber: order.OrderNumber,
      shipmentId: String(shipment.ID),
      currentStart: currentStart.toISOString().split('T')[0],
      currentEnd: currentEnd.toISOString().split('T')[0],
      suggestedStart: suggestedStart.toISOString().split('T')[0],
      suggestedEnd: suggestedEnd.toISOString().split('T')[0],
      isInvalid: isStartInvalid || isEndInvalid,
      isStartInvalid,
      isEndInvalid,
      repName: order.SalesRep || null,
      repEmail: order.RepID ? (repEmailMap.get(order.RepID) ?? null) : null,
      customerEmail: order.CustomerEmail || null,
      storeName: order.StoreName || null,
      itemCount,
      subtotal,
    })
  }

  const orderIds = new Set(affected.map((a) => a.orderId))

  return {
    affected,
    totalOrders: orderIds.size,
    totalShipments: affected.length,
    invalidCount: affected.filter((a) => a.isInvalid).length,
    shopifyExcludedCount,
  }
}
