/**
 * Client-safe thumbnail URL utilities
 *
 * This file contains only URL generation functions that can be used in both
 * client and server components. For thumbnail generation functions that use
 * sharp/crypto, see thumbnails.ts (server-only).
 */

// =============================================================================
// Configuration (must match thumbnails.ts)
// =============================================================================

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

// =============================================================================
// Cache Key Extraction (no crypto needed - just parsing)
// =============================================================================

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
  const bucket = process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME
  const region = process.env.NEXT_PUBLIC_AWS_REGION || process.env.AWS_REGION || 'us-east-1'
  const key = getThumbnailS3Key(cacheKey, size)
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

function appendWidthParam(url: string, width: number): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('width', String(width))
    return parsed.toString()
  } catch {
    const joiner = url.includes('?') ? '&' : '?'
    return `${url}${joiner}width=${width}`
  }
}

/**
 * Get src/srcset for SKU images.
 * Uses S3 thumbnails when available, otherwise Shopify CDN with width params.
 */
export function getSkuImageSrcSet(
  thumbnailPath: string | null | undefined,
  shopifyImageUrl: string | null | undefined,
  options: { includeXl?: boolean } = {}
): { src: string; srcSet: string } | null {
  const includeXl = options.includeXl !== false
  const candidates = includeXl
    ? [
        { size: 'sm' as const, width: THUMBNAIL_SIZES.sm },
        { size: 'md' as const, width: THUMBNAIL_SIZES.md },
        { size: 'lg' as const, width: THUMBNAIL_SIZES.lg },
        { size: 'xl' as const, width: THUMBNAIL_SIZES.xl },
      ]
    : [
        { size: 'sm' as const, width: THUMBNAIL_SIZES.sm },
        { size: 'md' as const, width: THUMBNAIL_SIZES.md },
        { size: 'lg' as const, width: THUMBNAIL_SIZES.lg },
      ]

  const cacheKey = extractCacheKey(thumbnailPath ?? null)
  if (cacheKey) {
    const srcSet = candidates
      .map(({ size, width }) => `${getThumbnailUrl(cacheKey, size)} ${width}w`)
      .join(', ')
    return { src: getThumbnailUrl(cacheKey, 'md'), srcSet }
  }

  if (shopifyImageUrl) {
    const srcSet = candidates
      .map(({ width }) => `${appendWidthParam(shopifyImageUrl, width)} ${width}w`)
      .join(', ')
    return { src: appendWidthParam(shopifyImageUrl, THUMBNAIL_SIZES.md), srcSet }
  }

  return null
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
