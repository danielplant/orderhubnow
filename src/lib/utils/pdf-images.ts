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
import { extractCacheKey, getThumbnailS3Key } from '@/lib/utils/thumbnails'

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
  // Try S3 first
  const cacheKey = extractCacheKey(thumbnailRef)
  if (cacheKey) {
    try {
      const s3Key = getThumbnailS3Key(cacheKey, size)
      const buffer = await getFromS3(s3Key)
      if (buffer) {
        return `data:image/png;base64,${buffer.toString('base64')}`
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
        return `data:${contentType};base64,${buffer.toString('base64')}`
      }
    } catch {
      // Return null
    }
  }

  return null
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
