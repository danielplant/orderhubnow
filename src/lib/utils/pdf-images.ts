/**
 * PDF Image Utilities
 *
 * Server-side utilities for embedding images in PDFs as base64 data URLs.
 * This approach is more reliable than using HTTP URLs because:
 * - S3 bucket may be private (403 errors)
 * - Puppeteer doesn't have AWS credentials
 * - Network latency/failures during PDF render
 *
 * Usage: Import in API routes that generate PDFs with product images.
 */

import { getFromS3 } from '@/lib/s3'
import { extractCacheKey, getThumbnailS3Key, getThumbnailS3KeyByPixel } from '@/lib/utils/thumbnails'

// =============================================================================
// Image Fetch Metrics Tracking
// =============================================================================

export interface ImageFetchStats {
  s3Hits: number
  shopifyFallbacks: number
  failures: number
  totalFetched: number
}

/**
 * Create a fresh stats object for tracking image fetches
 */
export function createImageFetchStats(): ImageFetchStats {
  return { s3Hits: 0, shopifyFallbacks: 0, failures: 0, totalFetched: 0 }
}

/**
 * Result from getImageDataUrlWithStats including source info
 */
export interface ImageFetchResult {
  dataUrl: string | null
  source: 's3' | 'shopify' | 'failed'
}

/**
 * Get image as base64 data URL for PDF embedding with source tracking.
 *
 * Fetches from S3 thumbnail first (using ThumbnailPath cache key),
 * falls back to Shopify CDN if S3 fails or no thumbnail exists.
 *
 * @param thumbnailRef - ThumbnailPath from SKU (16-char cache key or legacy format)
 * @param shopifyUrl - ShopifyImageURL fallback
 * @param size - Thumbnail size ('sm' = 120px for PDFs)
 * @returns Object with dataUrl and source for metrics tracking
 */
export async function getImageDataUrlWithStats(
  thumbnailRef: string | null,
  shopifyUrl: string | null,
  size: 'sm' | 'md' | 'lg' = 'sm'
): Promise<ImageFetchResult> {
  // Try S3 first
  const cacheKey = extractCacheKey(thumbnailRef)
  if (cacheKey) {
    try {
      const s3Key = getThumbnailS3Key(cacheKey, size)
      const buffer = await getFromS3(s3Key)
      if (buffer) {
        return {
          dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
          source: 's3',
        }
      }
    } catch {
      // Fall through to Shopify CDN
    }
  }

  // Fallback to Shopify CDN with resize
  if (shopifyUrl) {
    try {
      // Shopify CDN supports width parameter for resizing
      const width = size === 'sm' ? 120 : size === 'md' ? 240 : 480
      const url = `${shopifyUrl}${shopifyUrl.includes('?') ? '&' : '?'}width=${width}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        // Detect content type from response or default to png
        const contentType = response.headers.get('content-type') || 'image/png'
        return {
          dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
          source: 'shopify',
        }
      }
    } catch {
      // Return failed
    }
  }

  return { dataUrl: null, source: 'failed' }
}

/**
 * Export policy options for image fetching
 */
export interface ImageFetchPolicy {
  /** Pixel size for S3 thumbnails (e.g., 120) */
  thumbnailSize: number
  /** Block if S3 missing (vs allow fallback) */
  requireS3?: boolean
  /** Allow Shopify CDN fallback when S3 missing */
  allowShopifyFallback?: boolean
}

/**
 * Get image as base64 data URL with policy-driven configuration.
 *
 * Uses pixel size directly instead of 'sm'/'md'/'lg' mapping.
 * This is the preferred method for exports using DB-driven policy.
 *
 * @param thumbnailRef - ThumbnailPath from SKU (16-char cache key or legacy format)
 * @param shopifyUrl - ShopifyImageURL fallback
 * @param policy - Export policy with thumbnail size and fallback settings
 * @returns Object with dataUrl and source for metrics tracking
 */
export async function getImageDataUrlByPolicyWithStats(
  thumbnailRef: string | null,
  shopifyUrl: string | null,
  policy: ImageFetchPolicy
): Promise<ImageFetchResult> {
  const { thumbnailSize, requireS3 = true, allowShopifyFallback = true } = policy

  // Try S3 first
  const cacheKey = extractCacheKey(thumbnailRef)
  if (cacheKey) {
    try {
      const s3Key = getThumbnailS3KeyByPixel(cacheKey, thumbnailSize)
      const buffer = await getFromS3(s3Key)
      if (buffer) {
        return {
          dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
          source: 's3',
        }
      }
    } catch {
      // Fall through to Shopify CDN if allowed
    }
  }

  // If S3 required and no hit, return failed (don't fallback)
  if (requireS3 && !allowShopifyFallback) {
    return { dataUrl: null, source: 'failed' }
  }

  // Fallback to Shopify CDN with resize (if allowed)
  if (shopifyUrl && allowShopifyFallback) {
    try {
      // Shopify CDN supports width parameter for resizing
      const url = `${shopifyUrl}${shopifyUrl.includes('?') ? '&' : '?'}width=${thumbnailSize}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        // Detect content type from response or default to png
        const contentType = response.headers.get('content-type') || 'image/png'
        return {
          dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
          source: 'shopify',
        }
      }
    } catch {
      // Return failed
    }
  }

  return { dataUrl: null, source: 'failed' }
}

/**
 * Get image as base64 data URL for PDF embedding.
 *
 * Fetches from S3 thumbnail first (using ThumbnailPath cache key),
 * falls back to Shopify CDN if S3 fails or no thumbnail exists.
 *
 * @param thumbnailRef - ThumbnailPath from SKU (16-char cache key or legacy format)
 * @param shopifyUrl - ShopifyImageURL fallback
 * @param size - Thumbnail size ('sm' = 120px for PDFs)
 * @returns Base64 data URL (data:image/png;base64,...) or null
 */
export async function getImageDataUrl(
  thumbnailRef: string | null,
  shopifyUrl: string | null,
  size: 'sm' | 'md' | 'lg' = 'sm'
): Promise<string | null> {
  const result = await getImageDataUrlWithStats(thumbnailRef, shopifyUrl, size)
  return result.dataUrl
}

/**
 * Batch fetch images as base64 data URLs.
 *
 * Processes multiple images in parallel with concurrency control.
 * Returns a Map of identifier -> data URL for easy lookup.
 *
 * @param items - Array of {id, thumbnailPath, shopifyUrl}
 * @param concurrency - Max parallel fetches (default 10)
 * @returns Map of id -> base64 data URL (or null if failed)
 */
export async function batchGetImageDataUrls(
  items: Array<{
    id: string
    thumbnailPath: string | null
    shopifyUrl: string | null
  }>,
  concurrency = 10
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()

  // Process in batches for concurrency control
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const dataUrl = await getImageDataUrl(item.thumbnailPath, item.shopifyUrl)
        return { id: item.id, dataUrl }
      })
    )
    for (const { id, dataUrl } of batchResults) {
      results.set(id, dataUrl)
    }
  }

  return results
}

/**
 * Batch fetch images as base64 data URLs with metrics tracking.
 *
 * Processes multiple images in parallel with concurrency control.
 * Returns a Map of identifier -> data URL plus aggregate stats.
 *
 * @param items - Array of {id, thumbnailPath, shopifyUrl}
 * @param concurrency - Max parallel fetches (default 10)
 * @returns Object with results Map and stats
 */
export async function batchGetImageDataUrlsWithStats(
  items: Array<{
    id: string
    thumbnailPath: string | null
    shopifyUrl: string | null
  }>,
  concurrency = 10
): Promise<{ results: Map<string, string | null>; stats: ImageFetchStats }> {
  const results = new Map<string, string | null>()
  const stats = createImageFetchStats()

  // Process in batches for concurrency control
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const result = await getImageDataUrlWithStats(item.thumbnailPath, item.shopifyUrl)
        return { id: item.id, ...result }
      })
    )
    for (const { id, dataUrl, source } of batchResults) {
      results.set(id, dataUrl)
      stats.totalFetched++
      if (source === 's3') stats.s3Hits++
      else if (source === 'shopify') stats.shopifyFallbacks++
      else stats.failures++
    }
  }

  return { results, stats }
}
