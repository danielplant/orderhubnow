import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getSyncSettings } from '@/lib/data/queries/settings'
import { generateThumbnailCacheKey, extractCacheKey, THUMBNAIL_SIZES } from '@/lib/utils/thumbnails'
import type { ThumbnailSize } from '@/lib/utils/thumbnails'
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' })
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'orderhub-uploads'

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

    // Helper to check if S3 file exists
    async function s3Exists(key: string): Promise<boolean> {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }))
        return true
      } catch {
        return false
      }
    }

    // Check per-size existence in S3 (sample-based for speed)
    // For full accuracy on large datasets, we sample a subset
    const sizesToCheck: ThumbnailSize[] = ['sm', 'md', 'lg', 'xl']
    const bySize: Record<ThumbnailSize, { cached: number; needed: number }> = {
      sm: { cached: 0, needed: 0 },
      md: { cached: 0, needed: 0 },
      lg: { cached: 0, needed: 0 },
      xl: { cached: 0, needed: 0 },
    }

    // Process SKUs and check S3 for each size
    // Use batching to avoid overwhelming S3
    const BATCH_SIZE = 50 // Check 50 SKUs at a time
    const MAX_TO_CHECK = 500 // Check up to 500 SKUs for accurate sampling

    const skusToCheck = skus.slice(0, MAX_TO_CHECK)
    const sampleRatio = skus.length > MAX_TO_CHECK ? skus.length / MAX_TO_CHECK : 1

    for (let i = 0; i < skusToCheck.length; i += BATCH_SIZE) {
      const batch = skusToCheck.slice(i, i + BATCH_SIZE)

      await Promise.all(batch.map(async (sku) => {
        if (!sku.ShopifyImageURL) return

        // Use the stored cache key from ThumbnailPath if available
        // This reflects what was ACTUALLY generated, not what WOULD be generated with current settings
        const storedCacheKey = extractCacheKey(sku.ThumbnailPath)

        // For checking existing thumbnails, use stored cache key
        // For new images (no ThumbnailPath), use new cache key
        const cacheKeyToCheck = storedCacheKey || generateThumbnailCacheKey(
          sku.ShopifyImageURL,
          settings.thumbnailSettingsVersion
        )

        // Check each size in parallel
        await Promise.all(sizesToCheck.map(async (size) => {
          const s3Key = `thumbnails/${size}/${cacheKeyToCheck}.png`
          const exists = await s3Exists(s3Key)

          if (exists) {
            bySize[size].cached++
          } else {
            bySize[size].needed++
          }
        }))
      }))
    }

    // Scale up counts if we sampled
    if (sampleRatio > 1) {
      for (const size of sizesToCheck) {
        bySize[size].cached = Math.round(bySize[size].cached * sampleRatio)
        bySize[size].needed = Math.round(bySize[size].needed * sampleRatio)
      }
    }

    // Apply enabled filter - if size is disabled, show 0
    if (!settings.thumbnailSizeSmEnabled) bySize.sm = { cached: 0, needed: 0 }
    if (!settings.thumbnailSizeMdEnabled) bySize.md = { cached: 0, needed: 0 }
    if (!settings.thumbnailSizeLgEnabled) bySize.lg = { cached: 0, needed: 0 }
    if (!settings.thumbnailSizeXlEnabled) bySize.xl = { cached: 0, needed: 0 }

    // Overall counts (max across sizes since we generate all enabled sizes together)
    const needsGenerationCount = Math.max(
      bySize.sm.needed,
      bySize.md.needed,
      bySize.lg.needed,
      bySize.xl.needed
    )
    const cachedCount = skusWithImages - needsGenerationCount

    // Estimate time based on concurrency and average processing time
    // ~1 second per image at concurrency 10 = 100 images/minute
    const imagesPerMinute = settings.thumbnailBatchConcurrency * 6 // rough estimate
    const estimatedTimeMinutes = Math.ceil(needsGenerationCount / imagesPerMinute)

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
