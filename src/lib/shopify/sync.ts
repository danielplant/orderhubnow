/**
 * Shopify Sync Utilities
 *
 * Handles bulk operation management, gid parsing, and idempotent data ingestion.
 */

import { prisma } from '@/lib/prisma'

// ============================================================================
// GID Parsing
// ============================================================================

/**
 * Parse a Shopify GID string to extract the numeric ID.
 * @example parseShopifyGid('gid://shopify/ProductVariant/12345') → 12345n
 */
export function parseShopifyGid(gid: string): bigint | null {
  if (!gid) return null
  const match = gid.match(/\/(\d+)$/)
  return match ? BigInt(match[1]) : null
}

/**
 * Extract the resource type from a Shopify GID.
 * @example getGidResourceType('gid://shopify/ProductVariant/12345') → 'ProductVariant'
 */
export function getGidResourceType(gid: string): string | null {
  if (!gid) return null
  const match = gid.match(/gid:\/\/shopify\/(\w+)\/\d+/)
  return match ? match[1] : null
}

// ============================================================================
// Bulk Operation GraphQL
// ============================================================================

/**
 * GraphQL mutation to start a bulk operation for product variants.
 * Includes all metafields needed for sync (from .NET SyncController.cs).
 */
export const BULK_OPERATION_QUERY = `
  mutation {
    bulkOperationRunQuery(
      query: """
      {
        productVariants {
          edges {
            node {
              id
              sku
              price
              inventoryQuantity
              displayName
              title
              image {
                url
              }
              product {
                id
                title
                status
                featuredMedia {
                  preview {
                    image {
                      url
                    }
                  }
                }
                mfOrderEntryCollection: metafield(namespace: "custom", key: "order_entry_collection") {
                  value
                }
                mfOrderEntryDescription: metafield(namespace: "custom", key: "label_title") {
                  value
                }
                mfFabric: metafield(namespace: "custom", key: "fabric") {
                  value
                }
                mfColor: metafield(namespace: "custom", key: "color") {
                  value
                }
                mfCADWSPrice: metafield(namespace: "custom", key: "cad_ws_price") {
                  value
                }
                mfUSDWSPrice: metafield(namespace: "custom", key: "us_ws_price") {
                  value
                }
                mfMSRPCAD: metafield(namespace: "custom", key: "msrp_cad") {
                  value
                }
                mfMSRPUSD: metafield(namespace: "custom", key: "msrp_us") {
                  value
                }
              }
              inventoryItem {
                id
                measurement {
                  weight {
                    unit
                    value
                  }
                }
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      id
                      quantities(names: ["incoming", "committed"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      """
    ) {
      bulkOperation {
        id
        status
        url
      }
      userErrors {
        field
        message
      }
    }
  }
`

/**
 * GraphQL query to check current bulk operation status.
 */
export const CURRENT_BULK_OPERATION_QUERY = `
  query {
    currentBulkOperation {
      id
      status
      errorCode
      objectCount
      url
      completedAt
    }
  }
`

// ============================================================================
// Sync Run Management
// ============================================================================

/**
 * Check if there's a sync currently in progress.
 * Uses both DB lease (fast) and Shopify API check (authoritative).
 */
export async function isSyncInProgress(
  shopifyFetch: (query: string) => Promise<{ data?: unknown; error?: string }>
): Promise<{ inProgress: boolean; reason?: string; runId?: bigint }> {
  // 1. Check DB: Any ShopifySyncRun with status='started' within last 15 minutes?
  const dbRun = await prisma.shopifySyncRun.findFirst({
    where: {
      Status: 'started',
      StartedAt: {
        gte: new Date(Date.now() - 15 * 60 * 1000),
      },
    },
    orderBy: { StartedAt: 'desc' },
  })

  if (dbRun) {
    return {
      inProgress: true,
      reason: 'A sync is already in progress (started at ' + dbRun.StartedAt.toISOString() + ')',
      runId: dbRun.ID,
    }
  }

  // 2. Check Shopify: Is a bulk operation currently running?
  const result = await shopifyFetch(CURRENT_BULK_OPERATION_QUERY)

  if (result.error) {
    // If we can't check Shopify, be cautious but don't block
    console.warn('Could not check Shopify bulk operation status:', result.error)
    return { inProgress: false }
  }

  const operation = (result.data as { currentBulkOperation?: { status: string } })
    ?.currentBulkOperation

  if (operation && ['CREATED', 'RUNNING', 'CANCELING'].includes(operation.status)) {
    return {
      inProgress: true,
      reason: `Shopify bulk operation is ${operation.status.toLowerCase()}`,
    }
  }

  return { inProgress: false }
}

/**
 * Clean up orphaned sync runs.
 * Marks runs that have been "started" for more than 30 minutes as "timeout".
 * This handles cases where webhooks never arrive.
 */
export async function cleanupOrphanedRuns(): Promise<number> {
  const result = await prisma.shopifySyncRun.updateMany({
    where: {
      Status: 'started',
      StartedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
    },
    data: {
      Status: 'timeout',
      CompletedAt: new Date(),
      ErrorMessage: 'Sync timed out - webhook never received',
    },
  })
  
  if (result.count > 0) {
    console.log(`Cleaned up ${result.count} orphaned sync run(s)`)
  }
  
  return result.count
}

/**
 * Create a new sync run record.
 */
export async function createSyncRun(
  syncType: 'scheduled' | 'on-demand',
  operationId?: string
): Promise<bigint> {
  const run = await prisma.shopifySyncRun.create({
    data: {
      SyncType: syncType,
      Status: 'started',
      OperationId: operationId ?? null,
      StartedAt: new Date(),
    },
  })
  return run.ID
}

/**
 * Update a sync run with completion status.
 */
export async function completeSyncRun(
  operationId: string,
  status: 'completed' | 'failed' | 'timeout' | 'cancelled',
  itemCount?: number,
  errorMessage?: string
): Promise<void> {
  await prisma.shopifySyncRun.updateMany({
    where: { OperationId: operationId },
    data: {
      Status: status,
      CompletedAt: new Date(),
      ItemCount: itemCount ?? null,
      ErrorMessage: errorMessage ?? null,
    },
  })
}

/**
 * Get the latest sync run status.
 */
export async function getLatestSyncRun(): Promise<{
  id: bigint
  syncType: string
  status: string
  startedAt: Date
  completedAt: Date | null
  itemCount: number | null
  errorMessage: string | null
} | null> {
  const run = await prisma.shopifySyncRun.findFirst({
    orderBy: { StartedAt: 'desc' },
  })

  if (!run) return null

  return {
    id: run.ID,
    syncType: run.SyncType,
    status: run.Status,
    startedAt: run.StartedAt,
    completedAt: run.CompletedAt,
    itemCount: run.ItemCount,
    errorMessage: run.ErrorMessage,
  }
}

// ============================================================================
// Idempotent Data Ingestion
// ============================================================================

export interface ShopifyVariantData {
  gid: string
  sku: string
  price: string
  inventoryQuantity: number
  displayName: string
  productTitle?: string
  productGid?: string
  imageUrl?: string
  variantImageUrl?: string
  size?: string
  // Metafields from Shopify (from .NET SyncController.cs)
  metafield_order_entry_collection?: string
  metafield_order_entry_description?: string
  metafield_fabric?: string
  metafield_color?: string
  metafield_cad_ws_price?: string
  metafield_usd_ws_price?: string
  metafield_msrp_cad?: string
  metafield_msrp_us?: string
  // Weight data
  variantWeight?: number
  variantWeightUnit?: string
}

export interface ShopifyInventoryLevelData {
  inventoryItemId: string
  incoming: number
  committed: number
}

/**
 * Upsert a Shopify variant using find-then-update pattern.
 * This is idempotent: safe to call multiple times with the same data.
 * Includes all metafields for sync (from .NET SyncController.cs).
 */
export async function upsertShopifyVariant(data: ShopifyVariantData): Promise<void> {
  const numericId = parseShopifyGid(data.gid)

  // Find by RawShopifyId (the gid string) for exact match
  const existing = await prisma.rawSkusFromShopify.findFirst({
    where: { RawShopifyId: data.gid },
  })

  // Use variant image if available, otherwise fall back to product featured image
  const imageUrl = data.variantImageUrl || data.imageUrl || null

  const updateData = {
    SkuID: data.sku || '',
    Quantity: data.inventoryQuantity,
    DisplayName: data.displayName || data.productTitle || '',
    Size: data.size || '',
    Price: parseFloat(data.price) || 0,
    AvailableForSale: data.inventoryQuantity > 0,
    RawShopifyId: data.gid,
    ShopifyId: numericId,
    ShopifyProductImageURL: imageUrl,
    productId: data.productGid ?? null,
    // Metafields
    metafield_order_entry_collection: data.metafield_order_entry_collection ?? null,
    metafield_order_entry_description: data.metafield_order_entry_description ?? null,
    metafield_fabric: data.metafield_fabric ?? null,
    metafield_color: data.metafield_color ?? null,
    metafield_cad_ws_price: data.metafield_cad_ws_price ?? null,
    metafield_usd_ws_price: data.metafield_usd_ws_price ?? null,
    metafield_msrp_cad: data.metafield_msrp_cad ?? null,
    metafield_msrp_us: data.metafield_msrp_us ?? null,
    // Use cad_ws_price as the test price field (same as .NET)
    metafield_cad_ws_price_test: data.metafield_cad_ws_price ?? null,
    // Weight data
    VariantWeight: data.variantWeight ?? null,
    VariantWeightUnit: data.variantWeightUnit ?? null,
  }

  if (existing) {
    await prisma.rawSkusFromShopify.update({
      where: { ID: existing.ID },
      data: updateData,
    })
  } else {
    await prisma.rawSkusFromShopify.create({
      data: updateData,
    })
  }
}

/**
 * Upsert inventory level data for a variant.
 * Stores incoming and committed quantities.
 */
export async function upsertInventoryLevel(data: ShopifyInventoryLevelData): Promise<void> {
  // Find existing by inventory item ID
  const existing = await prisma.rawSkusInventoryLevelFromShopify.findFirst({
    where: { ParentId: data.inventoryItemId },
  })

  const updateData = {
    InventoryLevelId: data.inventoryItemId,
    ParentId: data.inventoryItemId,
    Incoming: data.incoming,
    CommittedQuantity: data.committed,
  }

  if (existing) {
    await prisma.rawSkusInventoryLevelFromShopify.update({
      where: { ID: existing.ID },
      data: updateData,
    })
  } else {
    await prisma.rawSkusInventoryLevelFromShopify.create({
      data: updateData,
    })
  }
}

/**
 * Type definitions for JSONL parsing
 */
interface ProductMetafield {
  value?: string
}

interface ProductData {
  id?: string
  title?: string
  status?: string
  featuredMedia?: {
    preview?: {
      image?: {
        url?: string
      }
    }
  }
  mfOrderEntryCollection?: ProductMetafield
  mfOrderEntryDescription?: ProductMetafield
  mfFabric?: ProductMetafield
  mfColor?: ProductMetafield
  mfCADWSPrice?: ProductMetafield
  mfUSDWSPrice?: ProductMetafield
  mfMSRPCAD?: ProductMetafield
  mfMSRPUSD?: ProductMetafield
}

interface InventoryItemData {
  id?: string
  measurement?: {
    weight?: {
      unit?: string
      value?: number
    }
  }
}

interface QuantityData {
  name: string
  quantity: number
}

interface InventoryLevelNode {
  id?: string
  quantities?: QuantityData[]
}

/**
 * Process a single JSONL line item.
 * Handles both ProductVariant and InventoryLevel records from bulk operation.
 */
async function processJsonlItem(item: Record<string, unknown>): Promise<boolean> {
  const itemId = item.id as string | undefined
  const parentId = item.__parentId as string | undefined

  // Handle ProductVariant records
  if (itemId && itemId.includes('ProductVariant')) {
    const product = item.product as ProductData | undefined
    const inventoryItem = item.inventoryItem as InventoryItemData | undefined
    const variantImage = item.image as { url?: string } | undefined

    // Extract metafield values safely
    const metafields = {
      order_entry_collection: product?.mfOrderEntryCollection?.value ?? undefined,
      order_entry_description: product?.mfOrderEntryDescription?.value ?? undefined,
      fabric: product?.mfFabric?.value ?? undefined,
      color: product?.mfColor?.value ?? undefined,
      cad_ws_price: product?.mfCADWSPrice?.value ?? undefined,
      usd_ws_price: product?.mfUSDWSPrice?.value ?? undefined,
      msrp_cad: product?.mfMSRPCAD?.value ?? undefined,
      msrp_us: product?.mfMSRPUSD?.value ?? undefined,
    }

    // Extract weight data
    const weight = inventoryItem?.measurement?.weight

    await upsertShopifyVariant({
      gid: itemId,
      sku: (item.sku as string) || '',
      price: (item.price as string) || '0',
      inventoryQuantity: (item.inventoryQuantity as number) ?? 0,
      displayName: (item.displayName as string) || '',
      size: (item.title as string) || '', // variant title is usually the size
      productTitle: product?.title,
      productGid: product?.id,
      imageUrl: product?.featuredMedia?.preview?.image?.url,
      variantImageUrl: variantImage?.url,
      // Metafields
      metafield_order_entry_collection: metafields.order_entry_collection,
      metafield_order_entry_description: metafields.order_entry_description,
      metafield_fabric: metafields.fabric,
      metafield_color: metafields.color,
      metafield_cad_ws_price: metafields.cad_ws_price,
      metafield_usd_ws_price: metafields.usd_ws_price,
      metafield_msrp_cad: metafields.msrp_cad,
      metafield_msrp_us: metafields.msrp_us,
      // Weight
      variantWeight: weight?.value,
      variantWeightUnit: weight?.unit,
    })
    return true
  }

  // Handle InventoryLevel records (nested under InventoryItem)
  // These come as separate lines in JSONL with __parentId pointing to the InventoryItem
  if (itemId && itemId.includes('InventoryLevel') && parentId) {
    const quantities = item.quantities as QuantityData[] | undefined

    let incoming = 0
    let committed = 0

    if (quantities) {
      for (const q of quantities) {
        if (q.name === 'incoming') incoming = q.quantity
        if (q.name === 'committed') committed = q.quantity
      }
    }

    // Extract inventory item ID from parent
    const inventoryItemId = parseShopifyGid(parentId)?.toString() ?? parentId

    await upsertInventoryLevel({
      inventoryItemId,
      incoming,
      committed,
    })
    return true
  }

  return false
}

/**
 * Process JSONL from a Shopify bulk operation result using streaming.
 * Streams the response to avoid loading the entire JSONL into memory.
 * This is critical for large catalogs (50k+ variants).
 */
export async function processJsonlStream(
  response: Response,
  onProgress?: (processed: number) => void
): Promise<{ processed: number; errors: number }> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body available for streaming')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let processed = 0
  let errors = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const item = JSON.parse(line)
          const wasProcessed = await processJsonlItem(item)
          if (wasProcessed) {
            processed++
            if (onProgress && processed % 100 === 0) {
              onProgress(processed)
            }
          }
        } catch (err) {
          console.error('Error processing JSONL line:', err)
          errors++
        }
      }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
      try {
        const item = JSON.parse(buffer)
        const wasProcessed = await processJsonlItem(item)
        if (wasProcessed) {
          processed++
        }
      } catch (err) {
        console.error('Error processing final JSONL line:', err)
        errors++
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { processed, errors }
}

/**
 * Process JSONL lines from a string (legacy/fallback method).
 * Use processJsonlStream for large catalogs.
 */
export async function processJsonlLines(
  jsonlText: string,
  onProgress?: (processed: number) => void
): Promise<{ processed: number; errors: number }> {
  const lines = jsonlText.trim().split('\n').filter(Boolean)
  let processed = 0
  let errors = 0

  for (const line of lines) {
    try {
      const item = JSON.parse(line)
      const wasProcessed = await processJsonlItem(item)
      if (wasProcessed) {
        processed++
        if (onProgress && processed % 100 === 0) {
          onProgress(processed)
        }
      }
    } catch (err) {
      console.error('Error processing JSONL line:', err)
      errors++
    }
  }

  return { processed, errors }
}

// ============================================================================
// Transform: RawSkusFromShopify → Sku Table
// TypeScript port of .NET TransformShopifySkus stored procedure
// Key difference: NO DU3/DU9 prefix - store clean SKU as-is
// ============================================================================

/**
 * Transform raw Shopify data to the Sku table.
 * This is the TypeScript equivalent of the .NET TransformShopifySkus stored procedure.
 *
 * Key difference from .NET: We store CLEAN SKUs without DU3/DU9 prefix.
 */
export async function transformToSkuTable(): Promise<{
  processed: number
  errors: number
  skipped: number
}> {
  console.log('Starting transform: RawSkusFromShopify → Sku table')

  let processed = 0
  let errors = 0
  let skipped = 0

  // 1. Fetch all categories for lookup
  const categories = await prisma.skuCategories.findMany({
    select: {
      ID: true,
      Name: true,
      IsPreOrder: true,
    },
  })

  // Build category lookup maps
  const categoryByName = new Map<string, { id: number; isPreOrder: boolean }>()
  for (const cat of categories) {
    // Store by lowercase name for case-insensitive matching
    categoryByName.set(cat.Name.toLowerCase().trim(), {
      id: cat.ID,
      isPreOrder: cat.IsPreOrder ?? false,
    })
  }

  // 2. Preserve existing DisplayPriority values
  const existingPriorities = new Map<string, number>()
  const existingSkus = await prisma.sku.findMany({
    select: { SkuID: true, DisplayPriority: true },
  })
  for (const sku of existingSkus) {
    if (sku.DisplayPriority != null) {
      existingPriorities.set(sku.SkuID, sku.DisplayPriority)
    }
  }
  console.log(`Preserved ${existingPriorities.size} DisplayPriority values`)

  // 3. Get inventory levels for OnRoute calculation
  const inventoryLevels = await prisma.rawSkusInventoryLevelFromShopify.findMany()
  const inventoryByParentId = new Map<string, { incoming: number; committed: number }>()
  for (const level of inventoryLevels) {
    inventoryByParentId.set(level.ParentId, {
      incoming: level.Incoming,
      committed: level.CommittedQuantity ?? 0,
    })
  }

  // 4. Fetch raw SKUs with valid metafields (same filter as .NET)
  const rawSkus = await prisma.rawSkusFromShopify.findMany({
    where: {
      SkuID: { contains: '-' }, // Must have dash
      metafield_order_entry_collection: {
        not: null,
        // Not empty and not GROUP (same as .NET)
      },
      // Must have pricing metafields
      metafield_cad_ws_price_test: { not: null },
      metafield_usd_ws_price: { not: null },
      metafield_msrp_cad: { not: null },
      metafield_msrp_us: { not: null },
    },
  })

  console.log(`Found ${rawSkus.length} raw SKUs to process`)

  // 5. Build Sku records
  const skuRecords: Array<{
    SkuID: string
    Description: string | null
    Quantity: number | null
    Price: string | null
    Size: string | null
    FabricContent: string | null
    SkuColor: string | null
    CategoryID: number | null
    OnRoute: number | null
    PriceCAD: string | null
    PriceUSD: string | null
    ShowInPreOrder: boolean | null
    OrderEntryDescription: string | null
    MSRPCAD: string | null
    MSRPUSD: string | null
    DisplayPriority: number | null
    ShopifyProductVariantId: bigint | null
    ShopifyImageURL: string | null
  }> = []

  for (const raw of rawSkus) {
    // Skip if no order_entry_collection or contains GROUP
    const orderEntryCollection = raw.metafield_order_entry_collection
    if (!orderEntryCollection || orderEntryCollection.includes('GROUP')) {
      skipped++
      continue
    }

    // Normalize Pre-Order → PreOrder (same as .NET)
    const normalizedCollection = orderEntryCollection.replace(/Pre-Order/gi, 'PreOrder')

    // Parse comma-separated categories
    const categoryTokens = normalizedCollection.split(',').map((t) => t.trim()).filter(Boolean)

    for (const token of categoryTokens) {
      // Check if PreOrder
      const isPreOrder = token.toLowerCase().includes('preorder')

      // Strip "PreOrder" to get category name
      const categoryName = token.replace(/PreOrder/gi, '').trim()

      // Skip Defective category
      if (categoryName.toLowerCase() === 'defective') {
        skipped++
        continue
      }

      // Lookup category - try exact match first, then fuzzy match
      let categoryMatch = categoryByName.get(categoryName.toLowerCase())

      // If no exact match, try to find by core keyword (like extractCoreCategory)
      if (!categoryMatch) {
        const coreKeywords = ['swim', 'cozy', 'active', 'resort', 'preppy goose', 'holiday']
        const lowerName = categoryName.toLowerCase()
        for (const keyword of coreKeywords) {
          if (lowerName.includes(keyword)) {
            // Find category containing this keyword with matching isPreOrder
            for (const [name, cat] of categoryByName) {
              if (name.includes(keyword) && cat.isPreOrder === isPreOrder) {
                categoryMatch = cat
                break
              }
            }
            if (categoryMatch) break
          }
        }
      }

      if (!categoryMatch) {
        // No matching category found
        skipped++
        continue
      }

      // Calculate OnRoute from inventory levels
      // Need to link via inventoryItem ID - get from RawShopifyId
      let onRoute = 0
      if (raw.ShopifyId) {
        const invLevel = inventoryByParentId.get(raw.ShopifyId.toString())
        if (invLevel) {
          onRoute = Math.max(0, invLevel.incoming - invLevel.committed)
        }
      }

      // Parse color from metafield (JSON array like ["Pink", "Blue"])
      let skuColor = ''
      if (raw.metafield_color) {
        try {
          const colors = JSON.parse(raw.metafield_color)
          if (Array.isArray(colors)) {
            skuColor = colors.join(', ')
          } else {
            skuColor = raw.metafield_color
          }
        } catch {
          // Not JSON, use as-is but clean up brackets
          skuColor = raw.metafield_color.replace(/[\[\]"]/g, '').trim()
        }
      }

      // Format price string (same as .NET: "CAD: X / USD: Y")
      const priceCAD = raw.metafield_cad_ws_price_test ?? ''
      const priceUSD = raw.metafield_usd_ws_price ?? ''
      const priceDisplay = priceCAD && priceUSD ? `CAD: ${priceCAD} / USD: ${priceUSD}` : ''

      // Get preserved DisplayPriority or default to 10000
      const displayPriority = existingPriorities.get(raw.SkuID) ?? 10000

      skuRecords.push({
        // CLEAN SKU - NO PREFIX (key difference from .NET)
        SkuID: raw.SkuID.toUpperCase(),
        Description: raw.DisplayName,
        Quantity: raw.Quantity,
        Price: priceDisplay || null,
        Size: raw.Size,
        FabricContent: raw.metafield_fabric,
        SkuColor: skuColor || null,
        CategoryID: categoryMatch.id,
        OnRoute: onRoute,
        PriceCAD: priceCAD || null,
        PriceUSD: priceUSD || null,
        ShowInPreOrder: isPreOrder,
        OrderEntryDescription: raw.metafield_order_entry_description,
        MSRPCAD: raw.metafield_msrp_cad,
        MSRPUSD: raw.metafield_msrp_us,
        DisplayPriority: displayPriority,
        ShopifyProductVariantId: raw.ShopifyId,
        ShopifyImageURL: raw.ShopifyProductImageURL,
      })

      processed++
    }
  }

  console.log(`Built ${skuRecords.length} Sku records`)

  // 6. Truncate and insert (same approach as .NET)
  // Using a transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    // Truncate Sku table
    await tx.$executeRaw`TRUNCATE TABLE Sku`

    // Insert all records
    for (const record of skuRecords) {
      try {
        await tx.sku.create({
          data: {
            SkuID: record.SkuID,
            Description: record.Description,
            Quantity: record.Quantity,
            Price: record.Price,
            Size: record.Size,
            FabricContent: record.FabricContent,
            SkuColor: record.SkuColor,
            CategoryID: record.CategoryID,
            OnRoute: record.OnRoute,
            PriceCAD: record.PriceCAD,
            PriceUSD: record.PriceUSD,
            ShowInPreOrder: record.ShowInPreOrder,
            OrderEntryDescription: record.OrderEntryDescription,
            MSRPCAD: record.MSRPCAD,
            MSRPUSD: record.MSRPUSD,
            DisplayPriority: record.DisplayPriority,
            ShopifyProductVariantId: record.ShopifyProductVariantId,
            ShopifyImageURL: record.ShopifyImageURL,
            DateAdded: new Date(),
            DateModified: new Date(),
          },
        })
      } catch (err) {
        console.error(`Error inserting SKU ${record.SkuID}:`, err)
        errors++
      }
    }
  })

  console.log(`Transform complete: ${processed} processed, ${errors} errors, ${skipped} skipped`)

  return { processed, errors, skipped }
}
