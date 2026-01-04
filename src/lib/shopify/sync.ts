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
              selectedOptions {
                name
                value
              }
              product {
                id
                title
                status
                featuredImage {
                  url
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
  size?: string
}

/**
 * Upsert a Shopify variant using find-then-update pattern.
 * This is idempotent: safe to call multiple times with the same data.
 */
export async function upsertShopifyVariant(data: ShopifyVariantData): Promise<void> {
  const numericId = parseShopifyGid(data.gid)

  // Find by RawShopifyId (the gid string) for exact match
  const existing = await prisma.rawSkusFromShopify.findFirst({
    where: { RawShopifyId: data.gid },
  })

  const updateData = {
    SkuID: data.sku || '',
    Quantity: data.inventoryQuantity,
    DisplayName: data.displayName || data.productTitle || '',
    Size: data.size || '',
    Price: parseFloat(data.price) || 0,
    AvailableForSale: data.inventoryQuantity > 0,
    RawShopifyId: data.gid,
    ShopifyId: numericId,
    ShopifyProductImageURL: data.imageUrl ?? null,
    productId: data.productGid ?? null,
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
 * Process a single JSONL line item.
 */
async function processJsonlItem(item: Record<string, unknown>): Promise<boolean> {
  // Shopify bulk results have nested structure
  // productVariants return: { id, sku, price, inventoryQuantity, displayName, product: {...} }
  if (item.id && typeof item.id === 'string' && item.id.includes('ProductVariant')) {
    const product = item.product as { id?: string; title?: string; featuredImage?: { url?: string } } | undefined
    await upsertShopifyVariant({
      gid: item.id,
      sku: (item.sku as string) || '',
      price: (item.price as string) || '0',
      inventoryQuantity: (item.inventoryQuantity as number) ?? 0,
      displayName: (item.displayName as string) || '',
      productTitle: product?.title,
      productGid: product?.id,
      imageUrl: product?.featuredImage?.url,
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
