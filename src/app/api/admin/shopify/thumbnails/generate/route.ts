import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getSyncSettings } from '@/lib/data/queries/settings'
import {
  createThumbnailRun,
  updateThumbnailProgress,
  completeThumbnailRun,
  isThumbnailGenerationInProgress,
} from '@/lib/data/queries/thumbnails'
import {
  generateThumbnailCacheKey,
  extractCacheKey,
  generateThumbnailSizesSelective,
  uploadThumbnailsToS3,
  type ThumbnailSize,
  type ThumbnailGenerationConfig,
} from '@/lib/utils/thumbnails'

/**
 * POST /api/admin/shopify/thumbnails/generate
 *
 * Triggers standalone thumbnail generation.
 * Runs in the background and returns immediately with run ID.
 */
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if already in progress
    const inProgress = await isThumbnailGenerationInProgress()
    if (inProgress) {
      return NextResponse.json(
        { success: false, error: 'Thumbnail generation already in progress' },
        { status: 409 }
      )
    }

    // Parse optional request body
    let force = false
    let sizesOverride: ThumbnailSize[] | null = null
    try {
      const body = await req.json()
      force = body.force === true
      if (Array.isArray(body.sizes)) {
        sizesOverride = body.sizes.filter((s: string) =>
          ['sm', 'md', 'lg', 'xl'].includes(s)
        ) as ThumbnailSize[]
      }
    } catch {
      // Empty body is fine
    }

    // Get settings
    const settings = await getSyncSettings()

    // Determine enabled sizes
    const enabledSizes: ThumbnailSize[] = sizesOverride ?? []
    if (!sizesOverride) {
      if (settings.thumbnailSizeSmEnabled) enabledSizes.push('sm')
      if (settings.thumbnailSizeMdEnabled) enabledSizes.push('md')
      if (settings.thumbnailSizeLgEnabled) enabledSizes.push('lg')
      if (settings.thumbnailSizeXlEnabled) enabledSizes.push('xl')
    }

    if (enabledSizes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No sizes enabled for generation' },
        { status: 400 }
      )
    }

    // Get SKUs needing thumbnails
    const skus = await prisma.sku.findMany({
      where: {
        ShopifyImageURL: { not: null },
      },
      select: {
        ID: true,
        SkuID: true,
        ShopifyImageURL: true,
        ThumbnailPath: true,
      },
    })

    // Filter to only those needing generation (unless force=true)
    const skusToProcess = force
      ? skus
      : skus.filter((sku) => {
          if (!sku.ShopifyImageURL) return false
          const expectedCacheKey = generateThumbnailCacheKey(
            sku.ShopifyImageURL,
            settings.thumbnailSettingsVersion
          )
          const currentCacheKey = extractCacheKey(sku.ThumbnailPath)
          return currentCacheKey !== expectedCacheKey
        })

    if (skusToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All thumbnails are up to date',
        runId: null,
        totalImages: 0,
      })
    }

    // Create run record
    const runId = await createThumbnailRun(enabledSizes, skusToProcess.length)

    // Start background processing (don't await)
    processThumbsInBackground(
      runId,
      skusToProcess,
      enabledSizes,
      settings
    ).catch((err) => {
      console.error('Background thumbnail processing error:', err)
    })

    return NextResponse.json({
      success: true,
      message: `Started generating thumbnails for ${skusToProcess.length} images`,
      runId: runId.toString(),
      totalImages: skusToProcess.length,
      enabledSizes,
    })
  } catch (error) {
    console.error('Thumbnail generate error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Background thumbnail processing
 */
async function processThumbsInBackground(
  runId: bigint,
  skus: Array<{
    ID: bigint
    SkuID: string
    ShopifyImageURL: string | null
    ThumbnailPath: string | null
  }>,
  enabledSizes: ThumbnailSize[],
  settings: {
    thumbnailSettingsVersion: number
    thumbnailBatchConcurrency: number
    thumbnailSizeSm: number
    thumbnailSizeMd: number
    thumbnailSizeLg: number
    thumbnailSizeXl: number
    thumbnailQuality: number
    thumbnailFit: string
    thumbnailBackground: string
  }
) {
  let processedCount = 0
  let skippedCount = 0
  let failedCount = 0

  const concurrency = settings.thumbnailBatchConcurrency
  const total = skus.length

  // Build config from settings
  const config: ThumbnailGenerationConfig = {
    version: settings.thumbnailSettingsVersion,
    sizes: {
      sm: settings.thumbnailSizeSm,
      md: settings.thumbnailSizeMd,
      lg: settings.thumbnailSizeLg,
      xl: settings.thumbnailSizeXl,
    },
    quality: settings.thumbnailQuality,
    fit: settings.thumbnailFit as 'contain' | 'cover' | 'fill',
    background: parseBackgroundColor(settings.thumbnailBackground),
  }

  try {
    // Process in batches
    for (let i = 0; i < skus.length; i += concurrency) {
      const batch = skus.slice(i, i + concurrency)

      const results = await Promise.all(
        batch.map(async (sku) => {
          if (!sku.ShopifyImageURL) {
            return { skuId: sku.SkuID, status: 'skipped' as const }
          }

          try {
            const cacheKey = generateThumbnailCacheKey(
              sku.ShopifyImageURL,
              config.version
            )

            // Generate only enabled sizes
            const buffers = await generateThumbnailSizesSelective(
              sku.ShopifyImageURL,
              enabledSizes,
              config
            )

            if (!buffers || buffers.size === 0) {
              return { skuId: sku.SkuID, status: 'failed' as const }
            }

            // Upload to S3
            const uploaded = await uploadThumbnailsToS3(cacheKey, buffers)
            if (!uploaded) {
              return { skuId: sku.SkuID, status: 'failed' as const }
            }

            // Update SKU with cache key
            await prisma.sku.update({
              where: { ID: sku.ID },
              data: { ThumbnailPath: cacheKey },
            })

            return { skuId: sku.SkuID, status: 'generated' as const, cacheKey }
          } catch (err) {
            console.error(`Failed to generate thumbnail for ${sku.SkuID}:`, err)
            return { skuId: sku.SkuID, status: 'failed' as const }
          }
        })
      )

      // Update counts
      for (const r of results) {
        if (r.status === 'generated') processedCount++
        else if (r.status === 'skipped') skippedCount++
        else failedCount++
      }

      // Update progress
      const percent = Math.round(((i + batch.length) / total) * 100)
      await updateThumbnailProgress(runId, {
        currentStep: `Processing ${enabledSizes.join(', ')}`,
        currentStepDetail: `${i + batch.length} of ${total} images`,
        progressPercent: percent,
        processedCount,
        skippedCount,
        failedCount,
      })
    }

    // Complete successfully
    await completeThumbnailRun(runId, 'completed', {
      processedCount,
      skippedCount,
      failedCount,
    })

    console.log(
      `Thumbnail generation completed: ${processedCount} generated, ${skippedCount} skipped, ${failedCount} failed`
    )
  } catch (error) {
    console.error('Thumbnail generation failed:', error)
    await completeThumbnailRun(runId, 'failed', {
      processedCount,
      skippedCount,
      failedCount,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

function parseBackgroundColor(hex: string): {
  r: number
  g: number
  b: number
  alpha: number
} {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) || 255
  const g = parseInt(clean.substring(2, 4), 16) || 255
  const b = parseInt(clean.substring(4, 6), 16) || 255
  return { r, g, b, alpha: 1 }
}
