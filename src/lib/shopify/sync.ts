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
 * Query to get bulk operation status and download URL.
 */
const BULK_OPERATION_STATUS_QUERY = `
  query($id: ID!) {
    node(id: $id) {
      ... on BulkOperation {
        id
        status
        errorCode
        objectCount
        fileSize
        url
      }
    }
  }
`

/**
 * Poll Shopify for bulk operation URL after webhook indicates completion.
 * The webhook doesn't include the URL - we need to fetch it.
 */
export async function getBulkOperationUrl(
  operationId: string
): Promise<{ url: string; objectCount: number } | null> {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

  if (!storeDomain || !accessToken) {
    console.error('Shopify credentials not configured')
    return null
  }

  try {
    const response = await fetch(
      `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: BULK_OPERATION_STATUS_QUERY,
          variables: { id: operationId },
        }),
      }
    )

    const result = await response.json()
    const op = result.data?.node

    if (!op) {
      console.error('Bulk operation not found:', operationId)
      return null
    }

    if (op.status !== 'COMPLETED') {
      console.error('Bulk operation not completed:', op.status)
      return null
    }

    if (!op.url) {
      console.error('Bulk operation has no URL')
      return null
    }

    return { url: op.url, objectCount: op.objectCount || 0 }
  } catch (err) {
    console.error('Error fetching bulk operation URL:', err)
    return null
  }
}

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
 * Create a backup of the Sku table before transformation.
 * Creates a timestamped backup table for rollback if needed.
 */
export async function backupSkuTable(): Promise<string | null> {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '_').slice(0, 15)
  const backupTableName = `Sku_backup_${timestamp}`

  try {
    // Create backup table with current data
    await prisma.$executeRawUnsafe(
      `SELECT * INTO ${backupTableName} FROM Sku`
    )
    console.log(`Created backup table: ${backupTableName}`)
    return backupTableName
  } catch (err) {
    console.error('Failed to create backup table:', err)
    return null
  }
}

/**
 * Transform raw Shopify data to the Sku table using bulk SQL.
 * This is the TypeScript equivalent of the .NET TransformShopifySkus stored procedure.
 *
 * Key difference from .NET: We store CLEAN SKUs without DU3/DU9 prefix.
 * 
 * Uses bulk INSERT...SELECT for performance (~2 seconds vs ~60+ seconds with individual inserts).
 */
export async function transformToSkuTable(options?: { skipBackup?: boolean }): Promise<{
  processed: number
  errors: number
  skipped: number
  backupTable?: string
}> {
  console.log('Starting bulk SQL transform: RawSkusFromShopify → Sku table')

  let backupTable: string | undefined

  // 0. Create backup before transformation (unless skipped)
  if (!options?.skipBackup) {
    const backup = await backupSkuTable()
    if (backup) {
      backupTable = backup
    } else {
      console.warn('Backup failed, proceeding anyway...')
    }
  }

  // Execute the bulk SQL transform
  // This does everything in a single SQL operation:
  // - Preserves DisplayPriority from existing Sku records
  // - Matches categories by name (handling PreOrder prefix)
  // - Formats price strings
  // - Cleans color JSON
  // - Handles PP categories 399/401 size mapping
  try {
    await prisma.$executeRaw`
      -- Step 1: Preserve existing DisplayPriority values in a temp table
      IF OBJECT_ID('tempdb..#PreservedPriority') IS NOT NULL DROP TABLE #PreservedPriority;
      SELECT SkuID, DisplayPriority INTO #PreservedPriority FROM Sku WHERE DisplayPriority IS NOT NULL;

      -- Step 2: Truncate Sku table
      TRUNCATE TABLE Sku;

      -- Step 3: Bulk insert with all transformations
      INSERT INTO Sku (
        SkuID, Description, Quantity, Price, Size, FabricContent, SkuColor,
        CategoryID, OnRoute, PriceCAD, PriceUSD, ShowInPreOrder,
        OrderEntryDescription, MSRPCAD, MSRPUSD, DisplayPriority,
        ShopifyProductVariantId, ShopifyImageURL, DateAdded, DateModified
      )
      SELECT DISTINCT
        -- CLEAN SKU - NO PREFIX (key difference from .NET)
        UPPER(r.SkuID) AS SkuID,
        r.DisplayName AS Description,
        r.Quantity,
        -- Price formatting: "CAD: X / USD: Y"
        CASE 
          WHEN r.metafield_cad_ws_price_test IS NOT NULL AND r.metafield_usd_ws_price IS NOT NULL
          THEN CONCAT('CAD: ', r.metafield_cad_ws_price_test, ' / USD: ', r.metafield_usd_ws_price)
          ELSE NULL
        END AS Price,
        -- Size with PP category special handling
        CASE
          WHEN c.ID IN (399, 401) THEN
            COALESCE(
              pp.CorrespondingPP,
              -- Extract last part of SKU after final dash as size
              REVERSE(LEFT(REVERSE(r.SkuID), CHARINDEX('-', REVERSE(r.SkuID)) - 1))
            )
          ELSE r.Size
        END AS Size,
        r.metafield_fabric AS FabricContent,
        -- Clean color JSON: remove brackets and quotes
        REPLACE(REPLACE(REPLACE(ISNULL(r.metafield_color, ''), '[', ''), ']', ''), '"', '') AS SkuColor,
        c.ID AS CategoryID,
        -- OnRoute: incoming - committed (simplified, using 0 for now)
        0 AS OnRoute,
        r.metafield_cad_ws_price_test AS PriceCAD,
        r.metafield_usd_ws_price AS PriceUSD,
        -- ShowInPreOrder: true if collection contains 'PreOrder'
        CASE WHEN r.metafield_order_entry_collection LIKE '%PreOrder%' THEN 1 ELSE 0 END AS ShowInPreOrder,
        r.metafield_order_entry_description AS OrderEntryDescription,
        r.metafield_msrp_cad AS MSRPCAD,
        r.metafield_msrp_us AS MSRPUSD,
        -- Preserve DisplayPriority or default to 10000
        COALESCE(p.DisplayPriority, 10000) AS DisplayPriority,
        r.ShopifyId AS ShopifyProductVariantId,
        r.ShopifyProductImageURL AS ShopifyImageURL,
        GETUTCDATE() AS DateAdded,
        GETUTCDATE() AS DateModified
      FROM RawSkusFromShopify r
      -- Join to find matching category
      INNER JOIN SkuCategories c ON (
        -- Normalize collection: replace "Pre-Order" with "PreOrder"
        -- Then match category name (strip PreOrder prefix for matching)
        LTRIM(RTRIM(REPLACE(
          REPLACE(r.metafield_order_entry_collection, 'Pre-Order', 'PreOrder'),
          'PreOrder', ''
        ))) LIKE '%' + c.Name + '%'
        -- Match IsPreOrder flag
        AND c.IsPreOrder = CASE WHEN r.metafield_order_entry_collection LIKE '%PreOrder%' THEN 1 ELSE 0 END
      )
      -- Left join to preserve DisplayPriority
      LEFT JOIN #PreservedPriority p ON p.SkuID = UPPER(r.SkuID)
      -- Left join to PPSizes for categories 399/401
      LEFT JOIN PPSizes pp ON (
        c.ID IN (399, 401) AND
        pp.Size = CASE
          -- Category 401 special mapping: 3→33, 4→44
          WHEN c.ID = 401 AND TRY_CAST(REVERSE(LEFT(REVERSE(r.SkuID), CHARINDEX('-', REVERSE(r.SkuID)) - 1)) AS INT) = 3 THEN 33
          WHEN c.ID = 401 AND TRY_CAST(REVERSE(LEFT(REVERSE(r.SkuID), CHARINDEX('-', REVERSE(r.SkuID)) - 1)) AS INT) = 4 THEN 44
          ELSE TRY_CAST(REVERSE(LEFT(REVERSE(r.SkuID), CHARINDEX('-', REVERSE(r.SkuID)) - 1)) AS INT)
        END
      )
      WHERE
        -- Must have dash in SKU
        r.SkuID LIKE '%-%'
        -- Must have order_entry_collection
        AND r.metafield_order_entry_collection IS NOT NULL
        AND LEN(r.metafield_order_entry_collection) > 0
        -- Exclude GROUP items (same as .NET)
        AND r.metafield_order_entry_collection NOT LIKE '%GROUP%'
        -- Must have pricing metafields
        AND r.metafield_cad_ws_price_test IS NOT NULL
        AND r.metafield_usd_ws_price IS NOT NULL
        AND r.metafield_msrp_cad IS NOT NULL
        AND r.metafield_msrp_us IS NOT NULL
        -- Exclude Defective category
        AND r.metafield_order_entry_collection NOT LIKE '%Defective%';

      -- Step 4: Remove duplicates (keep first by ID, same as .NET)
      WITH CTE AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY SkuID, CategoryID ORDER BY ID) AS rn
        FROM Sku
      )
      DELETE FROM CTE WHERE rn > 1;

      -- Cleanup temp table
      DROP TABLE #PreservedPriority;
    `

    // Get the final count
    const count = await prisma.sku.count()
    console.log(`Bulk SQL transform complete: ${count} SKUs inserted`)

    return { processed: count, errors: 0, skipped: 0, backupTable }
  } catch (err) {
    console.error('Bulk SQL transform failed:', err)
    throw err
  }
}
