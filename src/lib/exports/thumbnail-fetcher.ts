/**
 * Thumbnail Fetcher for Exports
 *
 * Provides bounded-concurrency thumbnail fetching with role-based fallback policy.
 *
 * Role-based behavior:
 * - Admins: S3-only (blocked by coverage gate if missing, but fallback allowed per policy)
 * - Reps: S3 first, Shopify fallback always allowed
 *
 * Phase 3: Durable Background Jobs
 */

import pLimit from 'p-limit'
import { getFromS3 } from '@/lib/s3'
import { extractCacheKey, getThumbnailS3KeyByPixel } from '@/lib/utils/thumbnails'
import { type ExportPolicy } from '@/lib/data/queries/export-policy'

// ============================================================================
// Types
// ============================================================================

export interface ThumbnailFetchResult {
  buffer: Buffer | null
  source: 's3' | 'shopify' | 'failed'
}

export interface ThumbnailFetchMetrics {
  s3Hits: number
  shopifyFallbacks: number
  failures: number
}

// ============================================================================
// Single Thumbnail Fetch
// ============================================================================

/**
 * Fetches a single thumbnail with role-based fallback policy.
 *
 * @param thumbnailRef - ThumbnailPath from SKU (contains cache key)
 * @param shopifyImageUrl - Fallback Shopify CDN URL
 * @param policy - Export policy from DB
 * @param userRole - 'admin' or 'rep' - affects fallback behavior
 */
export async function fetchThumbnailForExport(
  thumbnailRef: string | null,
  shopifyImageUrl: string | null,
  policy: ExportPolicy,
  userRole: 'admin' | 'rep'
): Promise<ThumbnailFetchResult> {
  // 1. Try S3 first
  const cacheKey = extractCacheKey(thumbnailRef)
  if (cacheKey) {
    try {
      const s3Key = getThumbnailS3KeyByPixel(cacheKey, policy.thumbnailSize)
      const buffer = await getFromS3(s3Key)
      if (buffer) {
        return { buffer, source: 's3' }
      }
    } catch (err) {
      console.warn(`[ThumbnailFetcher] S3 fetch failed for ${cacheKey}:`, err)
    }
  }

  // 2. Shopify fallback - ONLY for reps or if explicitly allowed in policy
  // Admins should generally have been blocked by coverage gate before reaching here,
  // but we respect the policy setting as a safety valve
  const allowFallback = userRole === 'rep' || policy.allowShopifyFallback

  if (shopifyImageUrl && allowFallback) {
    try {
      // Use Shopify's image resizing API
      const url = `${shopifyImageUrl}?width=${policy.thumbnailSize}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        return { buffer, source: 'shopify' }
      }
      console.warn(
        `[ThumbnailFetcher] Shopify returned ${response.status} for ${shopifyImageUrl}`
      )
    } catch (err) {
      console.warn(`[ThumbnailFetcher] Shopify fetch failed:`, err)
    }
  }

  return { buffer: null, source: 'failed' }
}

// ============================================================================
// Batch Thumbnail Fetch with Bounded Concurrency
// ============================================================================

export interface BatchThumbnailInput {
  baseSku: string
  ThumbnailPath: string | null
  ShopifyImageURL: string | null
}

/**
 * Batch fetch thumbnails with bounded concurrency and progress tracking.
 *
 * Uses p-limit to prevent overwhelming S3/Shopify with concurrent requests.
 * Reports progress via callback for UI updates.
 *
 * @param skus - Array of SKUs with thumbnail info
 * @param policy - Export policy from DB
 * @param userRole - 'admin' or 'rep'
 * @param onProgress - Optional callback for progress updates
 * @returns Map of baseSku -> Buffer and aggregate metrics
 */
export async function batchFetchThumbnails(
  skus: BatchThumbnailInput[],
  policy: ExportPolicy,
  userRole: 'admin' | 'rep',
  onProgress?: (processed: number, total: number) => void
): Promise<{
  results: Map<string, Buffer | null>
  metrics: ThumbnailFetchMetrics
}> {
  // Use configurable concurrency from policy, default to 10
  const concurrency = policy.imageConcurrency || 10
  const limit = pLimit(concurrency)

  const results = new Map<string, Buffer | null>()
  const metrics: ThumbnailFetchMetrics = {
    s3Hits: 0,
    shopifyFallbacks: 0,
    failures: 0,
  }
  let processed = 0

  await Promise.all(
    skus.map((sku) =>
      limit(async () => {
        const result = await fetchThumbnailForExport(
          sku.ThumbnailPath,
          sku.ShopifyImageURL,
          policy,
          userRole
        )

        results.set(sku.baseSku, result.buffer)

        // Update metrics
        if (result.source === 's3') {
          metrics.s3Hits++
        } else if (result.source === 'shopify') {
          metrics.shopifyFallbacks++
        } else {
          metrics.failures++
        }

        processed++
        onProgress?.(processed, skus.length)
      })
    )
  )

  return { results, metrics }
}

// ============================================================================
// Legacy Compatibility - matches existing function signature in route
// ============================================================================

/**
 * Legacy function signature for backward compatibility with current export routes.
 * Will be deprecated once generators are fully extracted.
 */
export async function fetchThumbnailForExportWithStats(
  thumbnailRef: string | null,
  shopifyImageUrl: string | null,
  policy: ExportPolicy
): Promise<ThumbnailFetchResult> {
  // Default to rep role for backward compatibility (allows fallback)
  return fetchThumbnailForExport(thumbnailRef, shopifyImageUrl, policy, 'rep')
}
