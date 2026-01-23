import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getSyncSettings } from '@/lib/data/queries/settings'
import { generateThumbnailCacheKey, extractCacheKey } from '@/lib/utils/thumbnails'
import type { ThumbnailSize } from '@/lib/utils/thumbnails'

/**
 * GET /api/admin/shopify/thumbnails/analyze
 *
 * Analyzes how many thumbnails need to be generated per size.
 * Returns breakdown and estimated time.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get settings for version and enabled sizes
    const settings = await getSyncSettings()

    const enabledSizes: ThumbnailSize[] = []
    if (settings.thumbnailSizeSmEnabled) enabledSizes.push('sm')
    if (settings.thumbnailSizeMdEnabled) enabledSizes.push('md')
    if (settings.thumbnailSizeLgEnabled) enabledSizes.push('lg')
    if (settings.thumbnailSizeXlEnabled) enabledSizes.push('xl')

    // Get all SKUs with Shopify images
    const skus = await prisma.sku.findMany({
      where: {
        ShopifyImageURL: { not: null },
      },
      select: {
        SkuID: true,
        ShopifyImageURL: true,
        ThumbnailPath: true,
      },
    })

    const totalSkus = await prisma.sku.count()
    const skusWithImages = skus.length
    const skusWithoutImages = totalSkus - skusWithImages

    // Count how many need generation vs are cached
    let cachedCount = 0
    let needsGenerationCount = 0

    for (const sku of skus) {
      if (!sku.ShopifyImageURL) continue

      const expectedCacheKey = generateThumbnailCacheKey(
        sku.ShopifyImageURL,
        settings.thumbnailSettingsVersion
      )
      const currentCacheKey = extractCacheKey(sku.ThumbnailPath)

      if (currentCacheKey === expectedCacheKey) {
        cachedCount++
      } else {
        needsGenerationCount++
      }
    }

    // Estimate time based on concurrency and average processing time
    // ~1 second per image at concurrency 10 = 100 images/minute
    const imagesPerMinute = settings.thumbnailBatchConcurrency * 6 // rough estimate
    const estimatedTimeMinutes = Math.ceil(needsGenerationCount / imagesPerMinute)

    // For per-size breakdown, we assume all sizes need generation if the cache key doesn't match
    // (since all sizes are generated together from the same source image)
    const bySize = {
      sm: {
        cached: settings.thumbnailSizeSmEnabled ? cachedCount : 0,
        needed: settings.thumbnailSizeSmEnabled ? needsGenerationCount : 0,
      },
      md: {
        cached: settings.thumbnailSizeMdEnabled ? cachedCount : 0,
        needed: settings.thumbnailSizeMdEnabled ? needsGenerationCount : 0,
      },
      lg: {
        cached: settings.thumbnailSizeLgEnabled ? cachedCount : 0,
        needed: settings.thumbnailSizeLgEnabled ? needsGenerationCount : 0,
      },
      xl: {
        cached: settings.thumbnailSizeXlEnabled ? cachedCount : 0,
        needed: settings.thumbnailSizeXlEnabled ? needsGenerationCount : 0,
      },
    }

    return NextResponse.json({
      success: true,
      analysis: {
        totalSkus,
        skusWithImages,
        skusWithoutImages,
        cachedCount,
        needsGenerationCount,
        bySize,
        enabledSizes,
        estimatedTimeMinutes,
        settings: {
          concurrency: settings.thumbnailBatchConcurrency,
          version: settings.thumbnailSettingsVersion,
          thumbnailDuringSync: settings.thumbnailDuringSync,
        },
      },
    })
  } catch (error) {
    console.error('Thumbnail analyze error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
