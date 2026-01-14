/**
 * Thumbnail utilities with content-hash based caching
 *
 * Uses a deterministic hash of (imageUrl + settings version) to:
 * 1. Automatically invalidate when source image changes
 * 2. Automatically invalidate when thumbnail settings change
 * 3. Deduplicate identical images used by multiple SKUs
 *
 * Cache key = sha256(imageUrl + THUMBNAIL_SETTINGS_VERSION).slice(0, 16)
 * Filename = {cacheKey}.png
 */

import crypto from 'crypto'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

// =============================================================================
// Configuration - BUMP VERSION WHEN SETTINGS CHANGE
// =============================================================================

/**
 * Thumbnail settings version - INCREMENT THIS when any setting below changes.
 * This ensures all thumbnails are regenerated when settings change.
 */
export const THUMBNAIL_SETTINGS_VERSION = 2

/**
 * Thumbnail dimensions and quality settings
 */
export const THUMBNAIL_CONFIG = {
  size: 120,        // Width and height in pixels
  quality: 80,      // PNG quality (1-100)
  fit: 'contain' as const,
  background: { r: 255, g: 255, b: 255, alpha: 1 },
} as const

const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails')

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
 * Extract cache key from a thumbnail path.
 * Returns null if path doesn't match expected format.
 */
export function extractCacheKeyFromPath(thumbnailPath: string | null): string | null {
  if (!thumbnailPath) return null

  // Expected format: /thumbnails/{16-char-hash}.png
  const match = thumbnailPath.match(/\/thumbnails\/([a-f0-9]{16})\.png$/)
  return match ? match[1] : null
}

/**
 * Check if a thumbnail needs regeneration.
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
  const currentCacheKey = extractCacheKeyFromPath(currentThumbnailPath)

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

  // Check if file actually exists on disk
  const fullPath = path.join(process.cwd(), 'public', currentThumbnailPath)
  if (!fs.existsSync(fullPath)) {
    return {
      needsRegen: true,
      reason: `File missing on disk: ${fullPath}`,
      expectedCacheKey
    }
  }

  // All good - no regeneration needed
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
 * Ensure thumbnails directory exists
 */
export function ensureThumbnailsDir(): void {
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true })
  }
}

/**
 * Get full filesystem path for a cache key
 */
function getThumbnailFilePath(cacheKey: string): string {
  return path.join(THUMBNAILS_DIR, `${cacheKey}.png`)
}

/**
 * Get public URL path for a cache key
 */
function getThumbnailUrlPath(cacheKey: string): string {
  return `/thumbnails/${cacheKey}.png`
}

/**
 * Fetch an image from URL and resize to thumbnail.
 * Returns PNG buffer or null if fetch fails.
 */
export async function fetchAndResizeImage(imageUrl: string): Promise<Buffer | null> {
  if (!imageUrl) return null

  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    if (!response.ok) {
      console.warn(`[Thumbnail] HTTP ${response.status} fetching ${imageUrl}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const thumbnail = await sharp(buffer)
      .resize(THUMBNAIL_CONFIG.size, THUMBNAIL_CONFIG.size, {
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

/**
 * Generate and save a thumbnail for an image URL.
 * Returns the public URL path if successful, null if failed.
 *
 * This is idempotent - if the file already exists with matching hash, it returns the path.
 */
export async function generateThumbnail(
  imageUrl: string
): Promise<{ path: string | null; cacheKey: string; fromCache: boolean }> {
  const cacheKey = generateThumbnailCacheKey(imageUrl)
  const filePath = getThumbnailFilePath(cacheKey)
  const urlPath = getThumbnailUrlPath(cacheKey)

  // Check if already exists (race condition protection)
  if (fs.existsSync(filePath)) {
    return { path: urlPath, cacheKey, fromCache: true }
  }

  // Generate new thumbnail
  const thumbnailBuffer = await fetchAndResizeImage(imageUrl)
  if (!thumbnailBuffer) {
    return { path: null, cacheKey, fromCache: false }
  }

  // Save to disk
  try {
    ensureThumbnailsDir()
    fs.writeFileSync(filePath, thumbnailBuffer)
    return { path: urlPath, cacheKey, fromCache: false }
  } catch (error) {
    console.error(`[Thumbnail] Failed to save ${filePath}:`, error)
    return { path: null, cacheKey, fromCache: false }
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
  thumbnailPath: string | null
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
 * Only regenerates when necessary (URL changed, settings changed, or file missing).
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
            thumbnailPath: null,
            status: 'no_image',
            reason: 'No image URL',
          }
        }

        // Check if regeneration needed
        const status = checkThumbnailStatus(item.imageUrl, item.currentThumbnailPath)

        if (!status.needsRegen) {
          return {
            skuId: item.skuId,
            thumbnailPath: item.currentThumbnailPath,
            status: 'skipped',
            reason: status.reason,
          }
        }

        // Generate new thumbnail
        const result = await generateThumbnail(item.imageUrl)

        if (result.path) {
          return {
            skuId: item.skuId,
            thumbnailPath: result.path,
            status: result.fromCache ? 'skipped' : 'generated',
            reason: result.fromCache
              ? 'Found existing file with matching hash'
              : `Generated new thumbnail (${status.reason})`,
          }
        } else {
          return {
            skuId: item.skuId,
            thumbnailPath: null,
            status: 'failed',
            reason: `Failed to generate: ${status.reason}`,
          }
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
 * @deprecated Use generateThumbnail() instead
 * Kept for backwards compatibility with existing code
 */
export async function fetchThumbnail(imageUrl: string): Promise<Buffer | null> {
  return fetchAndResizeImage(imageUrl)
}

/**
 * @deprecated Use checkThumbnailStatus() and file path instead
 * Read a thumbnail from disk by SKU ID (legacy format)
 */
export function readThumbnail(skuId: string): Buffer | null {
  // Try legacy format first
  const legacyPath = path.join(THUMBNAILS_DIR, `${skuId.replace(/[^a-zA-Z0-9-_]/g, '_')}.png`)
  if (fs.existsSync(legacyPath)) {
    return fs.readFileSync(legacyPath)
  }
  return null
}

/**
 * @deprecated Use generateThumbnail() instead
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function saveThumbnail(imageUrl: string, _skuId: string): Promise<string | null> {
  const result = await generateThumbnail(imageUrl)
  return result.path
}

/**
 * @deprecated Use processThumbnailsBatch() instead
 */
export async function saveThumbnailsBatch(
  items: Array<{ skuId: string; imageUrl: string | null }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  const syncItems: ThumbnailSyncItem[] = items.map(item => ({
    skuId: item.skuId,
    imageUrl: item.imageUrl,
    currentThumbnailPath: null, // Legacy API doesn't track current path
  }))

  const { results: syncResults } = await processThumbnailsBatch(syncItems)

  for (const result of syncResults) {
    if (result.thumbnailPath) {
      results.set(result.skuId, result.thumbnailPath)
    }
  }

  return results
}

// =============================================================================
// Debugging Utilities
// =============================================================================

/**
 * Get diagnostic information about thumbnail cache status
 */
export function getThumbnailDiagnostics(): {
  settingsVersion: number
  config: typeof THUMBNAIL_CONFIG
  thumbnailsDir: string
  thumbnailsDirExists: boolean
  fileCount: number
} {
  const thumbnailsDirExists = fs.existsSync(THUMBNAILS_DIR)
  let fileCount = 0

  if (thumbnailsDirExists) {
    try {
      fileCount = fs.readdirSync(THUMBNAILS_DIR).filter(f => f.endsWith('.png')).length
    } catch {
      fileCount = -1 // Error reading directory
    }
  }

  return {
    settingsVersion: THUMBNAIL_SETTINGS_VERSION,
    config: THUMBNAIL_CONFIG,
    thumbnailsDir: THUMBNAILS_DIR,
    thumbnailsDirExists,
    fileCount,
  }
}

/**
 * Log thumbnail sync summary for debugging
 */
export function logThumbnailSyncSummary(stats: ThumbnailSyncStats): void {
  console.log('\n=== Thumbnail Sync Summary ===')
  console.log(`Settings Version: ${THUMBNAIL_SETTINGS_VERSION}`)
  console.log(`Config: ${THUMBNAIL_CONFIG.size}x${THUMBNAIL_CONFIG.size}px @ ${THUMBNAIL_CONFIG.quality}% quality`)
  console.log('---')
  console.log(`Total SKUs:    ${stats.total}`)
  console.log(`  Skipped:     ${stats.skipped} (cache hit)`)
  console.log(`  Generated:   ${stats.generated} (new/updated)`)
  console.log(`  Failed:      ${stats.failed}`)
  console.log(`  No Image:    ${stats.noImage}`)
  console.log('==============================\n')
}
