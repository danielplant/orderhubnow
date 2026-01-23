/**
 * Shopify Sync Utilities
 *
 * Handles bulk operation management, gid parsing, and idempotent data ingestion.
 */

import { prisma } from '@/lib/prisma'
import { getStatusCascadeConfig } from '@/lib/data/queries/sync-config'
import {
  processThumbnailsBatch,
  logThumbnailSyncSummary,
  type ThumbnailSyncItem,
} from '@/lib/utils/thumbnails'
import { parseUnitsFromSku, calculateUnitPrice } from '@/lib/utils/units'

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
              selectedOptions {
                name
                value
              }
              image {
                url
              }
              product {
                id
                title
                status
                productType
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
                # NOTE: CAD wholesale price uses legacy key "test_number_" (created during testing, never renamed)
                # Shopify admin shows label "CAD WS PRICE" but underlying key is "test_number_"
                # All other price metafields have proper names (us_ws_price, msrp_cad, msrp_us)
                mfCADWSPrice: metafield(namespace: "custom", key: "test_number_") {
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
      ProgressPercent: status === 'completed' ? 100 : null,
    },
  })
}

/**
 * Update sync run progress for real-time dashboard.
 */
export async function updateSyncProgress(
  operationId: string,
  progress: {
    step: string           // e.g., "Step 2/5"
    detail: string         // e.g., "Polling: RUNNING, 12,450 objects"
    percent: number        // 0-100
    recordsProcessed?: number
    totalRecords?: number
  }
): Promise<void> {
  await prisma.shopifySyncRun.updateMany({
    where: { OperationId: operationId },
    data: {
      CurrentStep: progress.step,
      CurrentStepDetail: progress.detail,
      ProgressPercent: progress.percent,
      RecordsProcessed: progress.recordsProcessed ?? null,
      TotalRecords: progress.totalRecords ?? null,
    },
  })
}

/**
 * Get the latest sync run status with progress info.
 */
export async function getLatestSyncRun(): Promise<{
  id: bigint
  syncType: string
  status: string
  startedAt: Date
  completedAt: Date | null
  itemCount: number | null
  errorMessage: string | null
  // Progress fields
  currentStep: string | null
  currentStepDetail: string | null
  progressPercent: number | null
  recordsProcessed: number | null
  totalRecords: number | null
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
    // Progress fields
    currentStep: run.CurrentStep,
    currentStepDetail: run.CurrentStepDetail,
    progressPercent: run.ProgressPercent,
    recordsProcessed: run.RecordsProcessed,
    totalRecords: run.TotalRecords,
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
  productType?: string
  productStatus?: string // ACTIVE, ARCHIVED, DRAFT
  imageUrl?: string
  variantImageUrl?: string
  size?: string
  // Inventory item ID for linking to incoming quantities
  inventoryItemGid?: string
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
    ProductType: data.productType ?? null,
    ProductStatus: data.productStatus ?? null,
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
    // Inventory item ID for linking to incoming quantities (OnRoute)
    InventoryItemId: data.inventoryItemGid ? parseShopifyGid(data.inventoryItemGid)?.toString() : null,
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
  productType?: string
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

/**
 * Process a single JSONL line item.
 * Handles both ProductVariant and InventoryLevel records from bulk operation.
 */
async function processJsonlItem(
  item: Record<string, unknown>,
  options?: { ingestionAllowed?: string[] }
): Promise<boolean> {
  const itemId = item.id as string | undefined
  const parentId = item.__parentId as string | undefined

  // Handle ProductVariant records
  if (itemId && itemId.includes('ProductVariant')) {
    const product = item.product as ProductData | undefined
    const inventoryItem = item.inventoryItem as InventoryItemData | undefined
    const variantImage = item.image as { url?: string } | undefined
    const productStatus = product?.status ?? null

    // Filter by allowed statuses (cascade ingestion filter)
    if (options?.ingestionAllowed && !options.ingestionAllowed.includes(productStatus ?? '')) {
      return false
    }

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

    // Extract size from selectedOptions (preferred) or fall back to variant title
    const selectedOptions = item.selectedOptions as Array<{ name: string; value: string }> | undefined
    const sizeOption = selectedOptions?.find(opt => opt.name.toLowerCase() === 'size')
    const size = sizeOption?.value || (item.title as string) || ''

    await upsertShopifyVariant({
      gid: itemId,
      sku: (item.sku as string) || '',
      price: (item.price as string) || '0',
      inventoryQuantity: (item.inventoryQuantity as number) ?? 0,
      displayName: (item.displayName as string) || '',
      size,
      productTitle: product?.title,
      productGid: product?.id,
      productType: product?.productType,
      productStatus: productStatus ?? undefined,
      imageUrl: product?.featuredMedia?.preview?.image?.url,
      variantImageUrl: variantImage?.url,
      // Inventory item ID for linking to incoming quantities (OnRoute)
      inventoryItemGid: inventoryItem?.id,
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
  onProgress?: (processed: number) => void,
  options?: { ingestionAllowed?: string[] }
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
          const wasProcessed = await processJsonlItem(item, options)
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
        const wasProcessed = await processJsonlItem(item, options)
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
  onProgress?: (processed: number) => void,
  options?: { ingestionAllowed?: string[] }
): Promise<{ processed: number; errors: number }> {
  const lines = jsonlText.trim().split('\n').filter(Boolean)
  let processed = 0
  let errors = 0

  for (const line of lines) {
    try {
      const item = JSON.parse(line)
      const wasProcessed = await processJsonlItem(item, options)
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
// Uses new Collections system with explicit ShopifyValueMapping
// Key principle: Raw Shopify values stored EXACTLY as-is, no normalization
// ============================================================================

/**
 * Create a backup of the Sku table before transformation.
 * Stores backup data in BackupSet/BackupRow tables (normalized model).
 *
 * @returns BackupSet ID if successful, null if failed
 */
export async function backupSkuTable(): Promise<number | null> {
  try {
    // Get current row count
    const skuCount = await prisma.sku.count()

    if (skuCount === 0) {
      console.log('No SKUs to backup, skipping.')
      return null
    }

    // Create the BackupSet record
    const backupSet = await prisma.backupSet.create({
      data: {
        backupType: 'Sku',
        description: 'Pre-sync backup',
        rowCount: skuCount,
        createdBy: 'system',
        status: 'active',
      },
    })

    console.log(`Created BackupSet id=${backupSet.id} for ${skuCount} SKUs`)

    // Fetch all SKU rows
    const skus = await prisma.sku.findMany()

    // Insert rows in batches
    const batchSize = 500
    let inserted = 0

    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize)

      await prisma.backupRow.createMany({
        data: batch.map((sku) => ({
          backupSetId: backupSet.id,
          rowData: JSON.stringify(sku, (key, value) => {
            // Handle BigInt serialization
            if (typeof value === 'bigint') {
              return value.toString()
            }
            // Handle Date serialization
            if (value instanceof Date) {
              return value.toISOString()
            }
            // Handle Decimal serialization
            if (value && typeof value === 'object' && 'toNumber' in value) {
              return (value as { toNumber: () => number }).toNumber()
            }
            return value
          }),
        })),
      })

      inserted += batch.length
    }

    // Update size estimate (rough: average 500 bytes per row)
    await prisma.backupSet.update({
      where: { id: backupSet.id },
      data: { sizeBytes: skus.length * 500 },
    })

    console.log(`Backup complete: ${inserted} rows saved to BackupSet id=${backupSet.id}`)
    return backupSet.id
  } catch (err) {
    console.error('Failed to create backup:', err)
    return null
  }
}

/**
 * Clean up old backups based on retention period.
 * Deletes BackupSet records (and cascades to BackupRows) older than retention.
 *
 * @param retentionDays - Number of days to keep backups (default: 7)
 * @returns Object with counts of deleted and kept backups
 */
export async function cleanupOldBackups(retentionDays = 7): Promise<{
  deletedCount: number
  keptCount: number
  deletedIds: number[]
  errors: string[]
}> {
  const deletedIds: number[] = []
  const errors: string[] = []

  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    // Find backups older than retention period
    const oldBackups = await prisma.backupSet.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        status: 'active',
      },
      select: { id: true, backupType: true, createdAt: true, rowCount: true },
    })

    // Delete each old backup (cascade will delete rows)
    for (const backup of oldBackups) {
      try {
        await prisma.backupSet.delete({
          where: { id: backup.id },
        })
        deletedIds.push(backup.id)
        console.log(`Deleted old backup: id=${backup.id} (${backup.backupType}, ${backup.rowCount} rows, created ${backup.createdAt.toISOString()})`)
      } catch (deleteErr) {
        const errMsg = deleteErr instanceof Error ? deleteErr.message : 'Unknown error'
        errors.push(`BackupSet id=${backup.id}: ${errMsg}`)
        console.error(`Error deleting backup id=${backup.id}:`, deleteErr)
      }
    }

    // Count remaining backups
    const keptCount = await prisma.backupSet.count({
      where: { status: 'active' },
    })

    console.log(`Backup cleanup: ${deletedIds.length} deleted, ${keptCount} kept, ${errors.length} errors`)
    return { deletedCount: deletedIds.length, keptCount, deletedIds, errors }
  } catch (err) {
    console.error('Failed to cleanup old backups:', err)
    return { deletedCount: 0, keptCount: 0, deletedIds, errors: [err instanceof Error ? err.message : 'Unknown error'] }
  }
}

/**
 * Transform raw Shopify data to the Sku table using the new Collections system.
 *
 * Key principles:
 * - Raw Shopify values stored EXACTLY as-is (no normalization)
 * - Uses ShopifyValueMapping table for explicit admin-defined mappings
 * - Only SKUs with mapped values become visible to buyers
 * - Unmapped values are tracked but don't create SKUs
 */
export async function transformToSkuTable(options?: { skipBackup?: boolean }): Promise<{
  processed: number
  errors: number
  skipped: number
  unmappedValues: number
  backupSetId?: number
}> {
  console.log('Starting transform: RawSkusFromShopify → Sku table (using Collections)')

  let backupSetId: number | undefined

  // 0. Create backup before transformation (unless skipped)
  if (!options?.skipBackup) {
    const backup = await backupSkuTable()
    if (backup) {
      backupSetId = backup
    } else {
      console.warn('Backup failed or no data to backup, proceeding anyway...')
    }
  }

  try {
    // 1. Get all ShopifyValueMappings that are mapped to collections
    const mappings = await prisma.shopifyValueMapping.findMany({
      where: { status: 'mapped', collectionId: { not: null } },
    })
    const mappingMap = new Map<string, number>()
    for (const m of mappings) {
      if (m.collectionId) {
        mappingMap.set(m.rawValue, m.collectionId)
      }
    }
    console.log(`Loaded ${mappings.length} mapped Shopify values`)

    // 2. Get all collections to determine type (ATS vs PreOrder)
    const collections = await prisma.collection.findMany({
      select: { id: true, type: true },
    })
    const collectionTypeMap = new Map<number, string>()
    for (const c of collections) {
      collectionTypeMap.set(c.id, c.type)
    }

    // 3. Get SKU allowed statuses from cascade config
    // SECURITY: Only allow known valid status values to prevent SQL injection
    const VALID_STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED']
    const skuCascade = await getStatusCascadeConfig('Product')

    // Validate all status values against whitelist
    const validatedStatuses = skuCascade.skuAllowed.filter((s) => VALID_STATUSES.includes(s))

    let statusFilterClause = ''
    if (validatedStatuses.length > 0) {
      const quotedStatuses = validatedStatuses.map((s) => `'${s}'`).join(', ')
      statusFilterClause = `AND r.ProductStatus IN (${quotedStatuses})`
      console.log(`Applying SKU status filter: IN (${quotedStatuses})`)
    }

    // 4. Get raw SKUs with required fields
    const rawSkus = await prisma.$queryRawUnsafe<Array<{
      SkuID: string
      ShopifyId: bigint | null
      DisplayName: string | null
      Quantity: number | null
      Size: string | null
      ProductType: string | null
      metafield_fabric: string | null
      metafield_color: string | null
      metafield_cad_ws_price_test: string | null
      metafield_usd_ws_price: string | null
      metafield_msrp_cad: string | null
      metafield_msrp_us: string | null
      metafield_order_entry_collection: string | null
      metafield_order_entry_description: string | null
      ShopifyProductImageURL: string | null
      Incoming: number | null
      CommittedQuantity: number | null
    }>>(`
      SELECT r.SkuID, r.ShopifyId, r.DisplayName, r.Quantity, r.Size, r.ProductType,
             r.metafield_fabric, r.metafield_color, r.metafield_cad_ws_price_test,
             r.metafield_usd_ws_price, r.metafield_msrp_cad, r.metafield_msrp_us,
             r.metafield_order_entry_collection, r.metafield_order_entry_description,
             r.ShopifyProductImageURL,
             inv.Incoming,
             inv.CommittedQuantity
      FROM RawSkusFromShopify r
      LEFT JOIN RawSkusInventoryLevelFromShopify inv ON CAST(r.ShopifyId AS VARCHAR) = inv.ParentId
      WHERE r.SkuID LIKE '%-%'
        AND r.metafield_order_entry_collection IS NOT NULL
        AND LEN(r.metafield_order_entry_collection) > 0
        AND r.metafield_order_entry_collection NOT LIKE '%GROUP%'
        AND ISNULL(r.metafield_cad_ws_price_test, '') <> ''
        AND ISNULL(r.metafield_usd_ws_price, '') <> ''
        AND ISNULL(r.metafield_msrp_cad, '') <> ''
        AND ISNULL(r.metafield_msrp_us, '') <> ''
        ${statusFilterClause}
    `)
    console.log(`Found ${rawSkus.length} raw SKUs to process`)

    // 4. Track all raw values seen (for creating new unmapped entries)
    const seenRawValues = new Map<string, number>() // rawValue → count

    // 5. Build insert records - split collection by comma, exact match each
    const inserts: Array<{
      SkuID: string
      Description: string | null
      Quantity: number | null
      Price: string | null
      Size: string | null
      FabricContent: string | null
      SkuColor: string | null
      ProductType: string | null
      CategoryID: number | null
      CollectionID: number
      PriceCAD: string | null
      PriceUSD: string | null
      ShowInPreOrder: boolean
      OrderEntryDescription: string | null
      MSRPCAD: string | null
      MSRPUSD: string | null
      UnitsPerSku: number
      UnitPriceCAD: number | null
      UnitPriceUSD: number | null
      DisplayPriority: number
      ShopifyProductVariantId: bigint | null
      ShopifyImageURL: string | null
      OnRoute: number | null
    }> = []

    for (const r of rawSkus) {
      // Split by comma - keep values EXACTLY as-is (no normalization)
      const rawCollection = r.metafield_order_entry_collection || ''
      const parts = rawCollection.split(',').map(s => s.trim()).filter(Boolean)

      for (const rawValue of parts) {
        // Track this value
        seenRawValues.set(rawValue, (seenRawValues.get(rawValue) || 0) + 1)

        // Look up mapping - exact match only
        const collectionId = mappingMap.get(rawValue)

        if (collectionId) {
          // Determine if PreOrder based on collection type
          const collectionType = collectionTypeMap.get(collectionId)
          const isPreOrder = collectionType === 'PreOrder'

          // Parse units from SKU prefix (e.g., "2PC-..." → 2)
          const skuIdUpper = r.SkuID.toUpperCase()
          const unitsPerSku = parseUnitsFromSku(skuIdUpper)
          const unitPriceCAD = calculateUnitPrice(r.metafield_cad_ws_price_test, unitsPerSku)
          const unitPriceUSD = calculateUnitPrice(r.metafield_usd_ws_price, unitsPerSku)

          inserts.push({
            SkuID: skuIdUpper,
            Description: r.DisplayName,
            Quantity: r.Quantity,
            Price: r.metafield_cad_ws_price_test && r.metafield_usd_ws_price
              ? `CAD: ${r.metafield_cad_ws_price_test} / USD: ${r.metafield_usd_ws_price}`
              : null,
            Size: r.Size || '',
            FabricContent: r.metafield_fabric,
            SkuColor: (r.metafield_color || '').replace(/[\[\]"]/g, ''),
            ProductType: r.ProductType,
            CategoryID: null, // No longer using old CategoryID
            CollectionID: collectionId,
            PriceCAD: r.metafield_cad_ws_price_test,
            PriceUSD: r.metafield_usd_ws_price,
            ShowInPreOrder: isPreOrder,
            OrderEntryDescription: r.metafield_order_entry_description,
            MSRPCAD: r.metafield_msrp_cad,
            MSRPUSD: r.metafield_msrp_us,
            UnitsPerSku: unitsPerSku,
            UnitPriceCAD: unitPriceCAD,
            UnitPriceUSD: unitPriceUSD,
            DisplayPriority: 10000,
            ShopifyProductVariantId: r.ShopifyId,
            ShopifyImageURL: r.ShopifyProductImageURL,
            // OnRoute = incoming - committed (PO Quantity - Sold Quantity)
            OnRoute: Math.max(0, (r.Incoming ?? 0) - (r.CommittedQuantity ?? 0)),
          })
        }
        // If not mapped, SKU is NOT created (invisible to buyers)
      }
    }
    console.log(`Built ${inserts.length} Sku records from mapped values`)

    // 6. Upsert ShopifyValueMapping for all seen raw values
    console.log(`Updating ShopifyValueMapping for ${seenRawValues.size} unique raw values`)
    let newUnmapped = 0
    for (const [rawValue, count] of seenRawValues) {
      const existing = await prisma.shopifyValueMapping.findUnique({
        where: { rawValue },
      })

      if (existing) {
        // Update lastSeenAt and skuCount
        await prisma.shopifyValueMapping.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), skuCount: count },
        })
      } else {
        // Create new unmapped entry
        await prisma.shopifyValueMapping.create({
          data: {
            rawValue,
            status: 'unmapped',
            skuCount: count,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
        })
        newUnmapped++
      }
    }
    if (newUnmapped > 0) {
      console.log(`Created ${newUnmapped} new unmapped entries`)
    }

    // 7. Preserve ThumbnailPath before truncating (for cache continuity)
    const existingThumbnails = await prisma.sku.findMany({
      where: { ThumbnailPath: { not: null } },
      select: { SkuID: true, ThumbnailPath: true },
    })
    const thumbnailMap = new Map<string, string>()
    for (const sku of existingThumbnails) {
      if (sku.ThumbnailPath) {
        thumbnailMap.set(sku.SkuID, sku.ThumbnailPath)
      }
    }
    console.log(`Preserved ${thumbnailMap.size} thumbnail cache keys`)

    // 8. Truncate and bulk insert
    await prisma.$executeRawUnsafe('TRUNCATE TABLE Sku')

    // Insert in batches
    const batchSize = 500
    for (let i = 0; i < inserts.length; i += batchSize) {
      const batch = inserts.slice(i, i + batchSize)
      await prisma.sku.createMany({ data: batch })
    }

    // 9. Restore ThumbnailPath from preserved map
    let restoredCount = 0
    for (const [skuId, thumbnailPath] of thumbnailMap) {
      const updated = await prisma.sku.updateMany({
        where: { SkuID: skuId },
        data: { ThumbnailPath: thumbnailPath },
      })
      if (updated.count > 0) restoredCount++
    }
    console.log(`Restored ${restoredCount} thumbnail cache keys`)

    // 10. Remove duplicates (keep first by ID)
    await prisma.$executeRawUnsafe(`
      WITH CTE AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY SkuID, CollectionID ORDER BY ID DESC) AS rn FROM Sku
      )
      DELETE FROM CTE WHERE rn > 1
    `)

    const count = await prisma.sku.count()
    console.log(`Transform complete: ${count} SKUs`)

    // Count unmapped values for stats
    const unmappedCount = await prisma.shopifyValueMapping.count({
      where: { status: 'unmapped' },
    })

    return {
      processed: count,
      errors: 0,
      skipped: rawSkus.length - inserts.length,
      unmappedValues: unmappedCount,
      backupSetId,
    }
  } catch (err) {
    console.error('Transform failed:', err)
    throw err
  }
}

// ============================================================================
// Full Sync: Poll until complete, download, transform (like .NET)
// ============================================================================

/**
 * Run a complete Shopify sync: start bulk operation, poll until complete,
 * download JSONL, process to RawSkusFromShopify, transform to Sku table.
 *
 * This matches the .NET approach: synchronous polling, no webhooks.
 */
export async function runFullSync(options?: {
  onProgress?: (step: string, details?: string) => void
  maxWaitMs?: number
  pollIntervalMs?: number
}): Promise<{
  success: boolean
  message: string
  operationId?: string
  variantsProcessed?: number
  skusCreated?: number
  error?: string
}> {
  const onProgress = options?.onProgress ?? ((step, details) => console.log(`Sync: ${step}${details ? ` - ${details}` : ''}`))
  const maxWaitMs = options?.maxWaitMs ?? 300000 // 5 minutes default
  const pollIntervalMs = options?.pollIntervalMs ?? 3000 // 3 seconds default

  let operationId: string | undefined

  // Helper to call Shopify GraphQL
  const shopifyFetch = async (query: string, variables?: Record<string, unknown>): Promise<{ data?: unknown; error?: string }> => {
    const { SHOPIFY_ACCESS_TOKEN, SHOPIFY_STORE_DOMAIN, SHOPIFY_API_VERSION } = process.env

    if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
      return { error: 'Missing Shopify credentials' }
    }

    const endpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION || '2024-01'}/graphql.json`

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
      })

      if (!response.ok) {
        return { error: `Shopify API error: ${response.status} ${response.statusText}` }
      }

      const json = await response.json()
      return { data: json.data }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  try {
    onProgress('Starting', 'Cleaning up orphaned runs')
    await cleanupOrphanedRuns()

    // Check if sync is already in progress
    const { inProgress, reason } = await isSyncInProgress(shopifyFetch)
    if (inProgress) {
      return { success: false, message: 'Sync already in progress', error: reason }
    }

    // Step 1: Start bulk operation
    onProgress('Step 1/5', 'Starting bulk operation')
    // Note: Can't update progress yet - no operationId until after start
    const result = await shopifyFetch(BULK_OPERATION_QUERY)

    if (result.error) {
      return { success: false, message: 'Failed to start bulk operation', error: result.error }
    }

    const data = result.data as {
      bulkOperationRunQuery?: {
        bulkOperation?: { id: string; status: string }
        userErrors?: Array<{ field: string; message: string }>
      }
    }

    const bulkOp = data?.bulkOperationRunQuery?.bulkOperation
    const userErrors = data?.bulkOperationRunQuery?.userErrors

    if (userErrors && userErrors.length > 0) {
      return { success: false, message: 'Shopify error', error: userErrors[0].message }
    }

    if (!bulkOp?.id) {
      return { success: false, message: 'Failed to start bulk operation', error: 'No operation ID returned' }
    }

    operationId = bulkOp.id
    await createSyncRun('on-demand', operationId)
    onProgress('Step 1/5', `Bulk operation started: ${operationId}`)
    await updateSyncProgress(operationId, {
      step: 'Step 1/5',
      detail: 'Bulk operation started',
      percent: 5,
    })

    // Step 2: Poll until complete
    onProgress('Step 2/5', 'Polling for completion (this may take a few minutes)')
    await updateSyncProgress(operationId, {
      step: 'Step 2/5',
      detail: 'Polling Shopify bulk operation...',
      percent: 10,
    })

    const statusQuery = `
      query($id: ID!) {
        node(id: $id) {
          ... on BulkOperation {
            id
            status
            errorCode
            objectCount
            url
          }
        }
      }
    `

    const startTime = Date.now()
    let pollUrl: string | undefined
    let objectCount = 0

    while (Date.now() - startTime < maxWaitMs) {
      const pollResult = await shopifyFetch(statusQuery, { id: operationId })

      if (pollResult.error) {
        await completeSyncRun(operationId, 'failed', 0, pollResult.error)
        return { success: false, message: 'Polling failed', error: pollResult.error, operationId }
      }

      const op = (pollResult.data as { node?: { status: string; url?: string; objectCount?: number; errorCode?: string } })?.node

      if (!op) {
        await completeSyncRun(operationId, 'failed', 0, 'Bulk operation not found')
        return { success: false, message: 'Bulk operation not found', operationId }
      }

      const currentObjectCount = Number(op.objectCount) || 0
      onProgress('Step 2/5', `Status: ${op.status}, Objects: ${currentObjectCount}`)
      // Update progress in DB - oscillate between 10-35% during polling
      const elapsed = Date.now() - startTime
      const pollPercent = Math.min(35, 10 + Math.floor(elapsed / maxWaitMs * 25))
      await updateSyncProgress(operationId, {
        step: 'Step 2/5',
        detail: `Polling: ${op.status}, ${currentObjectCount} objects`,
        percent: pollPercent,
        totalRecords: currentObjectCount,
      })

      if (op.status === 'COMPLETED') {
        if (!op.url) {
          await completeSyncRun(operationId, 'failed', 0, 'Completed but no download URL')
          return { success: false, message: 'Completed but no download URL', operationId }
        }
        pollUrl = op.url
        objectCount = Number(op.objectCount) || 0
        break
      }

      if (op.status === 'FAILED') {
        await completeSyncRun(operationId, 'failed', 0, `Bulk operation failed: ${op.errorCode}`)
        return { success: false, message: 'Bulk operation failed', error: op.errorCode, operationId }
      }

      if (op.status === 'CANCELED') {
        await completeSyncRun(operationId, 'cancelled', 0, 'Bulk operation was canceled')
        return { success: false, message: 'Bulk operation was canceled', operationId }
      }

      // Still running, wait and poll again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    if (!pollUrl) {
      await completeSyncRun(operationId, 'timeout', 0, 'Timeout waiting for bulk operation')
      return { success: false, message: 'Timeout waiting for bulk operation', operationId }
    }

    onProgress('Step 2/5', `Complete - ${objectCount} objects`)
    await updateSyncProgress(operationId, {
      step: 'Step 2/5',
      detail: `Complete - ${objectCount} objects ready`,
      percent: 40,
      totalRecords: objectCount,
    })

    // Step 3: Download and process JSONL
    onProgress('Step 3/5', 'Downloading and processing variants')
    await updateSyncProgress(operationId, {
      step: 'Step 3/5',
      detail: 'Downloading JSONL data...',
      percent: 42,
      totalRecords: objectCount,
    })
    const jsonlResponse = await fetch(pollUrl)
    if (!jsonlResponse.ok) {
      await completeSyncRun(operationId, 'failed', 0, `Failed to download JSONL: ${jsonlResponse.status}`)
      return { success: false, message: 'Failed to download JSONL', operationId }
    }

    const cascadeConfig = await getStatusCascadeConfig('Product')

    const processResult = await processJsonlStream(
      jsonlResponse,
      async (n) => {
        if (n % 500 === 0) {
          onProgress('Step 3/5', `Processed ${n} variants`)
          // Update progress: 42-70% range during JSONL processing
          const processPercent = Math.min(70, 42 + Math.floor((n / Math.max(objectCount, 1)) * 28))
          await updateSyncProgress(operationId!, {
            step: 'Step 3/5',
            detail: `Processing variants: ${n.toLocaleString()} / ${objectCount.toLocaleString()}`,
            percent: processPercent,
            recordsProcessed: n,
            totalRecords: objectCount,
          })
        }
      },
      { ingestionAllowed: cascadeConfig.ingestionAllowed }
    )
    onProgress('Step 3/5', `Complete - ${processResult.processed} variants processed`)
    await updateSyncProgress(operationId, {
      step: 'Step 3/5',
      detail: `Complete - ${processResult.processed.toLocaleString()} variants ingested`,
      percent: 70,
      recordsProcessed: processResult.processed,
      totalRecords: objectCount,
    })

    // Step 4: Transform to Sku table
    onProgress('Step 4/5', 'Transforming to Sku table')
    await updateSyncProgress(operationId, {
      step: 'Step 4/5',
      detail: 'Transforming raw data to SKU table...',
      percent: 72,
      recordsProcessed: processResult.processed,
    })
    const transformResult = await transformToSkuTable()
    onProgress('Step 4/5', `Complete - ${transformResult.processed} SKUs created`)
    await updateSyncProgress(operationId, {
      step: 'Step 4/5',
      detail: `Complete - ${transformResult.processed.toLocaleString()} SKUs created`,
      percent: 85,
      recordsProcessed: transformResult.processed,
    })

    // Step 5: Generate thumbnails with smart caching
    // Only regenerates when: URL changed, settings changed, or file missing
    onProgress('Step 5/5', 'Processing thumbnails (smart cache)')
    await updateSyncProgress(operationId, {
      step: 'Step 5/5',
      detail: 'Loading SKUs for thumbnail processing...',
      percent: 86,
      recordsProcessed: transformResult.processed,
    })
    const skusWithImages = await prisma.sku.findMany({
      where: { ShopifyImageURL: { not: null } },
      select: { SkuID: true, ShopifyImageURL: true, ThumbnailPath: true },
    })

    const thumbnailItems: ThumbnailSyncItem[] = skusWithImages.map(s => ({
      skuId: s.SkuID,
      imageUrl: s.ShopifyImageURL,
      currentThumbnailPath: s.ThumbnailPath,
    }))

    if (thumbnailItems.length > 0) {
      const { results, stats } = await processThumbnailsBatch(thumbnailItems, {
        concurrency: 10,
        onProgress: async (processed, total, currentStats) => {
          const pct = Math.round((processed / total) * 100)
          onProgress(
            'Step 5/5',
            `Thumbnails: ${pct}% (${currentStats.generated} new, ${currentStats.skipped} cached)`
          )
          // Update progress: 86-99% range during thumbnail processing
          const thumbPercent = Math.min(99, 86 + Math.floor((processed / total) * 13))
          await updateSyncProgress(operationId!, {
            step: 'Step 5/5',
            detail: `Thumbnails: ${pct}% (${currentStats.generated} new, ${currentStats.skipped} cached)`,
            percent: thumbPercent,
            recordsProcessed: processed,
            totalRecords: total,
          })
        },
      })

      // Log summary for debugging
      logThumbnailSyncSummary(stats)

      // Update SKUs that got new thumbnails - store cache key only (not full path)
      const updates = results.filter(
        r => r.status === 'generated' && r.cacheKey
      )

      for (const update of updates) {
        await prisma.sku.updateMany({
          where: { SkuID: update.skuId },
          data: { ThumbnailPath: update.cacheKey },  // Store just the 16-char cache key
        })
      }

      onProgress(
        'Step 5/5',
        `Complete - ${stats.generated} generated, ${stats.skipped} cached, ${stats.failed} failed`
      )
      await updateSyncProgress(operationId, {
        step: 'Step 5/5',
        detail: `Complete - ${stats.generated} new, ${stats.skipped} cached, ${stats.failed} failed`,
        percent: 99,
        recordsProcessed: thumbnailItems.length,
        totalRecords: thumbnailItems.length,
      })
    } else {
      onProgress('Step 5/5', 'Complete - No images to process')
      await updateSyncProgress(operationId, {
        step: 'Step 5/5',
        detail: 'Complete - No images to process',
        percent: 99,
      })
    }

    // Mark sync as complete
    await completeSyncRun(operationId, 'completed', transformResult.processed)

    // Cleanup old backups (older than 7 days)
    // This runs after successful sync to avoid accumulating backup data
    try {
      const cleanupResult = await cleanupOldBackups(7)
      if (cleanupResult.deletedCount > 0) {
        onProgress('Cleanup', `Removed ${cleanupResult.deletedCount} old backups`)
      }
    } catch (cleanupErr) {
      // Don't fail the sync if cleanup fails - just log it
      console.warn('Backup cleanup failed (non-fatal):', cleanupErr)
    }

    return {
      success: true,
      message: 'Sync completed successfully',
      operationId,
      variantsProcessed: processResult.processed,
      skusCreated: transformResult.processed,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Sync error:', err)
    if (operationId) {
      await completeSyncRun(operationId, 'failed', 0, errorMessage)
    }
    return { success: false, message: 'Sync failed', error: errorMessage, operationId }
  }
}
