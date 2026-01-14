import { prisma } from '@/lib/prisma'
import { parsePrice, parseSkuId, resolveColor } from '@/lib/utils'
import { sortBySize, extractSize } from '@/lib/utils/size-sort'
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

// ============================================================================
// Collection Queries
// ============================================================================

/**
 * Get all collections grouped by type (ATS and PreOrder)
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
    ats: mapped.filter((c) => c.type === 'ATS'),
    preOrder: mapped.filter((c) => c.type === 'PreOrder'),
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
    ats: mapped.filter((c) => c.type === 'ATS'),
    preOrder: mapped.filter((c) => c.type === 'PreOrder'),
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
}

/**
 * Get ATS collections for buyer page
 * Returns collections with product count, ordered by admin-defined sort order
 */
export async function getATSCollectionsForBuyer(): Promise<BuyerCollection[]> {
  const collections = await prisma.collection.findMany({
    where: { type: 'ATS', isActive: true },
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
    where: { type: 'PreOrder', isActive: true },
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
 */
export async function getSkusByCollection(collectionId: number): Promise<Product[]> {
  const skus = await prisma.sku.findMany({
    where: {
      CollectionID: collectionId,
      ShowInPreOrder: false,
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

  // Group SKUs by BaseSku + ImageURL
  const grouped = new Map<string, Array<typeof skus[0] & { baseSku: string; size: string }>>()

  for (const sku of skus) {
    const { baseSku } = parseSkuId(sku.SkuID)
    const size = extractSize(sku.Size || '')
    const skuWithParsed = { ...sku, baseSku, size }

    const imageUrl = sku.ShopifyImageURL ?? ''
    const groupKey = `${baseSku}::${imageUrl}`

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, [])
    }
    grouped.get(groupKey)!.push(skuWithParsed)
  }

  // Transform each group into a Product
  const products: Product[] = []

  for (const [groupKey, skuGroup] of grouped) {
    const first = skuGroup[0]
    const baseSku = first.baseSku

    const variants: ProductVariant[] = sortBySize(
      skuGroup.map((sku) => ({
        size: sku.size,
        sku: sku.SkuID,
        available: sku.Quantity ?? 0,
        onRoute: sku.OnRoute ?? 0,
        priceCad: parsePrice(sku.PriceCAD),
        priceUsd: parsePrice(sku.PriceUSD),
      }))
    )

    const title = first.OrderEntryDescription ?? first.Description ?? baseSku
    products.push({
      id: groupKey,
      skuBase: baseSku,
      title,
      fabric: first.FabricContent ?? '',
      color: resolveColor(first.SkuColor, first.SkuID, title),
      productType: first.ProductType ?? '',
      priceCad: parsePrice(first.PriceCAD),
      priceUsd: parsePrice(first.PriceUSD),
      msrpCad: parsePrice(first.MSRPCAD),
      msrpUsd: parsePrice(first.MSRPUSD),
      imageUrl: first.ShopifyImageURL ?? '',
      variants,
    })
  }

  return products
}

/**
 * Get PreOrder products by collection ID (line sheet/catalog - no stock filter)
 */
export async function getPreOrderProductsByCollection(collectionId: number): Promise<Product[]> {
  const skus = await prisma.sku.findMany({
    where: {
      CollectionID: collectionId,
      ShowInPreOrder: true,
    },
    orderBy: [
      { DisplayPriority: 'asc' },
      { SkuID: 'asc' },
    ],
  })

  // Group SKUs by BaseSku + ImageURL
  const grouped = new Map<string, Array<typeof skus[0] & { baseSku: string; size: string }>>()

  for (const sku of skus) {
    const { baseSku } = parseSkuId(sku.SkuID)
    const size = extractSize(sku.Size || '')
    const skuWithParsed = { ...sku, baseSku, size }

    const imageUrl = sku.ShopifyImageURL ?? ''
    const groupKey = `${baseSku}::${imageUrl}`

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, [])
    }
    grouped.get(groupKey)!.push(skuWithParsed)
  }

  // Transform each group into a Product
  const products: Product[] = []

  for (const [groupKey, skuGroup] of grouped) {
    const first = skuGroup[0]
    const baseSku = first.baseSku

    const variants: ProductVariant[] = sortBySize(
      skuGroup.map((sku) => ({
        size: sku.size,
        sku: sku.SkuID,
        available: sku.OnRoute ?? 0, // Use OnRoute for PreOrder
        onRoute: sku.OnRoute ?? 0,
        priceCad: parsePrice(sku.PriceCAD),
        priceUsd: parsePrice(sku.PriceUSD),
      }))
    )

    const title = first.OrderEntryDescription ?? first.Description ?? baseSku
    products.push({
      id: groupKey,
      skuBase: baseSku,
      title,
      fabric: first.FabricContent ?? '',
      color: resolveColor(first.SkuColor, first.SkuID, title),
      productType: first.ProductType ?? '',
      priceCad: parsePrice(first.PriceCAD),
      priceUsd: parsePrice(first.PriceUSD),
      msrpCad: parsePrice(first.MSRPCAD),
      msrpUsd: parsePrice(first.MSRPUSD),
      imageUrl: first.ShopifyImageURL ?? '',
      variants,
    })
  }

  return products
}

/**
 * Get PreOrder collection by ID with ship window dates
 */
export async function getPreOrderCollectionById(collectionId: number): Promise<BuyerPreOrderCollection | null> {
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId, type: 'PreOrder', isActive: true },
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
  }
}
