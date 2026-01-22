/**
 * Thumbnail utilities with content-hash based caching and S3 storage
 *
 * Uses a deterministic hash of (imageUrl + settings version) to:
 * 1. Automatically invalidate when source image changes
 * 2. Automatically invalidate when thumbnail settings change
 * 3. Deduplicate identical images used by multiple SKUs
 *
 * Storage: S3 with multiple sizes (120px, 240px, 480px, 720px)
 * Cache key = sha256(imageUrl + THUMBNAIL_SETTINGS_VERSION).slice(0, 16)
 * S3 key = thumbnails/{size}/{cacheKey}.png
 */

import crypto from 'crypto'
import sharp from 'sharp'
import { uploadToS3 } from '@/lib/s3'

// =============================================================================
// Configuration - BUMP VERSION WHEN SETTINGS CHANGE
// =============================================================================

/**
 * Thumbnail settings version - INCREMENT THIS when any setting below changes.
 * This ensures all thumbnails are regenerated when settings change.
 */
export const THUMBNAIL_SETTINGS_VERSION = 5

/**
 * Available thumbnail sizes
 */
export const THUMBNAIL_SIZES = {
  sm: 120,  // For exports (Excel, PDF)
  md: 240,  // For UI display
  lg: 480,  // For high-DPI / zoom
  xl: 720,  // For large product cards
} as const

export type ThumbnailSize = keyof typeof THUMBNAIL_SIZES

/**
 * Thumbnail generation settings
 */
export const THUMBNAIL_CONFIG = {
  sizes: THUMBNAIL_SIZES,
  quality: 80,      // PNG quality (1-100)
  fit: 'contain' as const,
  background: { r: 255, g: 255, b: 255, alpha: 1 },
  format: 'png' as const,
} as const

// =============================================================================
// Cache Key Generation
// =============================================================================

/**
 * Generate a deterministic cache key from image URL and settings.
 * Returns a 16-character hex string.
 *
 * The hash includes:
 * - The full image URL (including query params like ?v=123)
 * - The settings version number
 *
 * This ensures automatic cache invalidation when either changes.
 */
export function generateThumbnailCacheKey(imageUrl: string): string {
  const hashInput = `${imageUrl}|v${THUMBNAIL_SETTINGS_VERSION}`
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex')
  return hash.slice(0, 16)
}

/**
 * Extract cache key from various formats:
 * - New format: just the 16-char cache key (abc123def456abc1)
 * - Old format: /thumbnails/{cacheKey}.png
 * - S3 URL format: .../thumbnails/{size}/{cacheKey}.png
 *
 * Returns null if format doesn't match.
 */
export function extractCacheKey(thumbnailRef: string | null): string | null {
  if (!thumbnailRef) return null

  // New format: just the 16-char cache key
  if (/^[a-f0-9]{16}$/.test(thumbnailRef)) {
    return thumbnailRef
  }

  // Old format: /thumbnails/{cacheKey}.png
  const oldMatch = thumbnailRef.match(/\/thumbnails\/([a-f0-9]{16})\.png$/)
  if (oldMatch) return oldMatch[1]

  // S3 URL format: .../thumbnails/{size}/{cacheKey}.png
  const s3Match = thumbnailRef.match(/\/thumbnails\/\d+\/([a-f0-9]{16})\.png/)
  if (s3Match) return s3Match[1]

  return null
}

// =============================================================================
// S3 URL Generation
// =============================================================================

/**
 * Get S3 key for a thumbnail
 * @param cacheKey - 16-char cache key
 * @param size - Thumbnail size variant
 * @returns S3 key like "thumbnails/120/abc123def456abc1.png"
 */
export function getThumbnailS3Key(cacheKey: string, size: ThumbnailSize = 'sm'): string {
  const sizePx = THUMBNAIL_SIZES[size]
  return `thumbnails/${sizePx}/${cacheKey}.png`
}

/**
 * Get full S3 URL for a thumbnail
 * @param cacheKey - 16-char cache key
 * @param size - Thumbnail size variant
 * @returns Full S3 URL
 */
export function getThumbnailUrl(cacheKey: string, size: ThumbnailSize = 'sm'): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME
  const region = process.env.AWS_REGION || 'us-east-1'
  const key = getThumbnailS3Key(cacheKey, size)
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

/**
 * Get the best image URL for a SKU - prefer S3 thumbnail, fallback to Shopify CDN
 *
 * @param thumbnailPath - The ThumbnailPath from the SKU (16-char cache key or legacy format)
 * @param shopifyImageUrl - The ShopifyImageURL fallback
 * @param size - Thumbnail size variant ('sm' = 120px, 'md' = 240px, 'lg' = 480px, 'xl' = 720px)
 * @returns S3 thumbnail URL if available, otherwise Shopify CDN URL, or null
 */
export function getSkuImageUrl(
  thumbnailPath: string | null | undefined,
  shopifyImageUrl: string | null | undefined,
  size: ThumbnailSize = 'md'
): string | null {
  // Try S3 thumbnail first
  const cacheKey = extractCacheKey(thumbnailPath ?? null)
  if (cacheKey) {
    return getThumbnailUrl(cacheKey, size)
  }

  // Fallback to Shopify CDN
  return shopifyImageUrl ?? null
}

// =============================================================================
// Thumbnail Status Checking
// =============================================================================

/**
 * Check if a thumbnail needs regeneration.
 *
 * For S3 storage, we trust the database cache key. If the cache key matches
 * what we'd generate from the current URL, we assume the S3 files exist.
 * This avoids expensive HEAD requests during sync.
 *
 * Returns { needsRegen: boolean, reason: string } for debugging.
 */
export function checkThumbnailStatus(
  imageUrl: string | null,
  currentThumbnailPath: string | null
): { needsRegen: boolean; reason: string; expectedCacheKey: string | null } {
  // No image URL = no thumbnail needed
  if (!imageUrl) {
    return {
      needsRegen: false,
      reason: 'No image URL provided',
      expectedCacheKey: null
    }
  }

  const expectedCacheKey = generateThumbnailCacheKey(imageUrl)
  const currentCacheKey = extractCacheKey(currentThumbnailPath)

  // No current thumbnail
  if (!currentThumbnailPath || !currentCacheKey) {
    return {
      needsRegen: true,
      reason: 'No existing thumbnail',
      expectedCacheKey
    }
  }

  // Cache key mismatch (URL or settings changed)
  if (currentCacheKey !== expectedCacheKey) {
    return {
      needsRegen: true,
      reason: `Cache key mismatch: current=${currentCacheKey}, expected=${expectedCacheKey}`,
      expectedCacheKey
    }
  }

  // Cache hit - trust that S3 has the files
  return {
    needsRegen: false,
    reason: 'Cache hit - thumbnail up to date',
    expectedCacheKey
  }
}

// =============================================================================
// Thumbnail Generation
// =============================================================================

/**
 * Fetch an image from URL and resize to all thumbnail sizes.
 * Returns a Map of size -> Buffer, or null if fetch fails.
 */
export async function generateThumbnailSizes(
  imageUrl: string
): Promise<Map<ThumbnailSize, Buffer> | null> {
  if (!imageUrl) return null

  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000), // 15 second timeout
    })

    if (!response.ok) {
      console.warn(`[Thumbnail] HTTP ${response.status} fetching ${imageUrl}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const sourceBuffer = Buffer.from(arrayBuffer)

    const results = new Map<ThumbnailSize, Buffer>()

    // Generate all sizes in parallel
    const sizes: ThumbnailSize[] = ['sm', 'md', 'lg', 'xl']
    const buffers = await Promise.all(
      sizes.map(async (size) => {
        const px = THUMBNAIL_SIZES[size]
        const buffer = await sharp(sourceBuffer)
          .resize(px, px, {
            fit: THUMBNAIL_CONFIG.fit,
            background: THUMBNAIL_CONFIG.background,
          })
          .png({ quality: THUMBNAIL_CONFIG.quality })
          .toBuffer()
        return { size, buffer }
      })
    )

    for (const { size, buffer } of buffers) {
      results.set(size, buffer)
    }

    return results
  } catch (error) {
    console.warn(`[Thumbnail] Failed to generate sizes for ${imageUrl}:`, error)
    return null
  }
}

/**
 * Upload all thumbnail sizes to S3
 * @param cacheKey - 16-char cache key
 * @param buffers - Map of size -> Buffer
 * @returns true if all uploads succeeded
 */
export async function uploadThumbnailsToS3(
  cacheKey: string,
  buffers: Map<ThumbnailSize, Buffer>
): Promise<boolean> {
  try {
    const uploads = Array.from(buffers.entries()).map(([size, buffer]) => {
      const key = getThumbnailS3Key(cacheKey, size)
      return uploadToS3(buffer, key, 'image/png')
    })

    await Promise.all(uploads)
    return true
  } catch (error) {
    console.error(`[Thumbnail] S3 upload failed for ${cacheKey}:`, error)
    return false
  }
}

/**
 * Generate and upload thumbnails for an image URL.
 * Returns the cache key if successful.
 *
 * This generates all size variants (120, 240, 480, 720) and uploads to S3.
 */
export async function generateThumbnail(
  imageUrl: string
): Promise<{ cacheKey: string; success: boolean }> {
  const cacheKey = generateThumbnailCacheKey(imageUrl)

  // Generate all sizes
  const buffers = await generateThumbnailSizes(imageUrl)
  if (!buffers) {
    return { cacheKey, success: false }
  }

  // Upload to S3
  const uploaded = await uploadThumbnailsToS3(cacheKey, buffers)

  return {
    cacheKey,
    success: uploaded,
  }
}

// =============================================================================
// Batch Processing for Sync
// =============================================================================

export interface ThumbnailSyncItem {
  skuId: string
  imageUrl: string | null
  currentThumbnailPath: string | null
}

export interface ThumbnailSyncResult {
  skuId: string
  cacheKey: string | null
  status: 'skipped' | 'generated' | 'failed' | 'no_image'
  reason: string
}

export interface ThumbnailSyncStats {
  total: number
  skipped: number
  generated: number
  failed: number
  noImage: number
}

/**
 * Process thumbnails for a batch of SKUs with smart caching.
 * Only regenerates when necessary (URL changed, settings changed, or missing).
 *
 * Returns detailed results for each SKU and aggregate stats.
 */
export async function processThumbnailsBatch(
  items: ThumbnailSyncItem[],
  options: {
    concurrency?: number
    onProgress?: (processed: number, total: number, stats: ThumbnailSyncStats) => void
  } = {}
): Promise<{ results: ThumbnailSyncResult[]; stats: ThumbnailSyncStats }> {
  const { concurrency = 10, onProgress } = options

  const results: ThumbnailSyncResult[] = []
  const stats: ThumbnailSyncStats = {
    total: items.length,
    skipped: 0,
    generated: 0,
    failed: 0,
    noImage: 0,
  }

  // Process in batches for concurrency control
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)

    const batchResults = await Promise.all(
      batch.map(async (item): Promise<ThumbnailSyncResult> => {
        // No image URL
        if (!item.imageUrl) {
          return {
            skuId: item.skuId,
            cacheKey: null,
            status: 'no_image',
            reason: 'No image URL',
          }
        }

        // Check if regeneration needed
        const status = checkThumbnailStatus(item.imageUrl, item.currentThumbnailPath)

        if (!status.needsRegen) {
          return {
            skuId: item.skuId,
            cacheKey: status.expectedCacheKey,
            status: 'skipped',
            reason: status.reason,
          }
        }

        // Generate new thumbnails and upload to S3
        const result = await generateThumbnail(item.imageUrl)

        return {
          skuId: item.skuId,
          cacheKey: result.success ? result.cacheKey : null,
          status: result.success ? 'generated' : 'failed',
          reason: result.success
            ? `Generated new thumbnail (${status.reason})`
            : 'Failed to generate',
        }
      })
    )

    // Collect results and update stats
    for (const result of batchResults) {
      results.push(result)
      switch (result.status) {
        case 'skipped': stats.skipped++; break
        case 'generated': stats.generated++; break
        case 'failed': stats.failed++; break
        case 'no_image': stats.noImage++; break
      }
    }

    // Progress callback
    if (onProgress) {
      onProgress(results.length, items.length, { ...stats })
    }
  }

  return { results, stats }
}

// =============================================================================
// Legacy API Compatibility
// =============================================================================

/**
 * Fetch and resize a single image (for fallback in exports)
 * Returns smallest size buffer for export use
 */
export async function fetchAndResizeImage(imageUrl: string): Promise<Buffer | null> {
  if (!imageUrl) return null

  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      console.warn(`[Thumbnail] HTTP ${response.status} fetching ${imageUrl}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const thumbnail = await sharp(buffer)
      .resize(THUMBNAIL_SIZES.sm, THUMBNAIL_SIZES.sm, {
        fit: THUMBNAIL_CONFIG.fit,
        background: THUMBNAIL_CONFIG.background,
      })
      .png({ quality: THUMBNAIL_CONFIG.quality })
      .toBuffer()

    return thumbnail
  } catch (error) {
    console.warn(`[Thumbnail] Failed to fetch/resize ${imageUrl}:`, error)
    return null
  }
}

// =============================================================================
// Debugging Utilities
// =============================================================================

/**
 * Get diagnostic information about thumbnail configuration
 */
export function getThumbnailDiagnostics(): {
  settingsVersion: number
  config: typeof THUMBNAIL_CONFIG
  sizes: typeof THUMBNAIL_SIZES
  s3Bucket: string | undefined
} {
  return {
    settingsVersion: THUMBNAIL_SETTINGS_VERSION,
    config: THUMBNAIL_CONFIG,
    sizes: THUMBNAIL_SIZES,
    s3Bucket: process.env.AWS_S3_BUCKET_NAME,
  }
}

/**
 * Log thumbnail sync summary for debugging
 */
export function logThumbnailSyncSummary(stats: ThumbnailSyncStats): void {
  console.log('\n=== Thumbnail Sync Summary ===')
  console.log(`Settings Version: ${THUMBNAIL_SETTINGS_VERSION}`)
  console.log(`Sizes: ${Object.entries(THUMBNAIL_SIZES).map(([k, v]) => `${k}=${v}px`).join(', ')}`)
  console.log('---')
  console.log(`Total SKUs:    ${stats.total}`)
  console.log(`  Skipped:     ${stats.skipped} (cache hit)`)
  console.log(`  Generated:   ${stats.generated} (new/updated)`)
  console.log(`  Failed:      ${stats.failed}`)
  console.log(`  No Image:    ${stats.noImage}`)
  console.log('==============================\n')
}
