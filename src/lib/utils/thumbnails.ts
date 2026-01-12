/**
 * Thumbnail utilities for image processing
 * Uses Sharp to fetch and resize images for XLSX export and table display
 */

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const THUMBNAIL_SIZE = 100
const THUMBNAIL_QUALITY = 80
const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails')

/**
 * Fetch an image from URL and resize to thumbnail
 * Returns PNG buffer or null if fetch fails
 */
export async function fetchThumbnail(imageUrl: string): Promise<Buffer | null> {
  if (!imageUrl) return null

  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) return null

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const thumbnail = await sharp(buffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png({ quality: THUMBNAIL_QUALITY })
      .toBuffer()

    return thumbnail
  } catch (error) {
    console.warn(`Failed to fetch thumbnail for ${imageUrl}:`, error)
    return null
  }
}

/**
 * Batch fetch thumbnails for multiple image URLs
 * Returns Map of URL -> Buffer (null values filtered out)
 */
export async function fetchThumbnailsBatch(
  imageUrls: string[]
): Promise<Map<string, Buffer>> {
  const uniqueUrls = [...new Set(imageUrls.filter(Boolean))]
  const results = new Map<string, Buffer>()

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 10
  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE)
    const thumbnails = await Promise.all(
      batch.map(async (url) => {
        const thumbnail = await fetchThumbnail(url)
        return { url, thumbnail }
      })
    )

    for (const { url, thumbnail } of thumbnails) {
      if (thumbnail) {
        results.set(url, thumbnail)
      }
    }
  }

  return results
}

/**
 * Ensure thumbnails directory exists
 */
export function ensureThumbnailsDir(): void {
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true })
  }
}

/**
 * Generate thumbnail filename from SKU ID
 * Sanitizes SKU to be filesystem-safe
 */
export function getThumbnailFilename(skuId: string): string {
  const safeName = skuId.replace(/[^a-zA-Z0-9-_]/g, '_')
  return `${safeName}.png`
}

/**
 * Get full path for a thumbnail
 */
export function getThumbnailPath(skuId: string): string {
  return path.join(THUMBNAILS_DIR, getThumbnailFilename(skuId))
}

/**
 * Get public URL path for a thumbnail (for serving via Next.js)
 */
export function getThumbnailUrl(skuId: string): string {
  return `/thumbnails/${getThumbnailFilename(skuId)}`
}

/**
 * Save a thumbnail to disk from an image URL
 * Returns the relative path if successful, null if failed
 */
export async function saveThumbnail(
  imageUrl: string,
  skuId: string
): Promise<string | null> {
  if (!imageUrl) return null

  try {
    const thumbnailBuffer = await fetchThumbnail(imageUrl)
    if (!thumbnailBuffer) return null

    ensureThumbnailsDir()
    
    const thumbnailPath = getThumbnailPath(skuId)
    fs.writeFileSync(thumbnailPath, thumbnailBuffer)
    
    return getThumbnailUrl(skuId)
  } catch (error) {
    console.warn(`Failed to save thumbnail for ${skuId}:`, error)
    return null
  }
}

/**
 * Read a thumbnail from disk
 * Returns buffer if exists, null otherwise
 */
export function readThumbnail(skuId: string): Buffer | null {
  const thumbnailPath = getThumbnailPath(skuId)
  
  if (fs.existsSync(thumbnailPath)) {
    return fs.readFileSync(thumbnailPath)
  }
  
  return null
}

/**
 * Batch save thumbnails for multiple SKUs during sync
 * Returns Map of SKU ID -> thumbnail URL path
 */
export async function saveThumbnailsBatch(
  items: Array<{ skuId: string; imageUrl: string | null }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  
  ensureThumbnailsDir()

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 10
  const itemsWithImages = items.filter((item) => item.imageUrl)
  
  for (let i = 0; i < itemsWithImages.length; i += BATCH_SIZE) {
    const batch = itemsWithImages.slice(i, i + BATCH_SIZE)
    const saved = await Promise.all(
      batch.map(async ({ skuId, imageUrl }) => {
        const thumbnailUrl = await saveThumbnail(imageUrl!, skuId)
        return { skuId, thumbnailUrl }
      })
    )

    for (const { skuId, thumbnailUrl } of saved) {
      if (thumbnailUrl) {
        results.set(skuId, thumbnailUrl)
      }
    }
  }

  return results
}
