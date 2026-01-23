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
  generateThumbnailsByPixelSize,
  uploadThumbnailsByPixelSize,
  type PixelSizeConfig,
} from '@/lib/utils/thumbnails'

/**
 * POST /api/admin/shopify/images/generate
 *
 * Triggers standalone thumbnail generation for specified pixel sizes.
 * Reads size configurations from ThumbnailSize table.
 * Runs in the background and returns immediately.
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

    // Parse request body
    let pixelSizes: number[] = []
    let force = false
    try {
      const body = await req.json()
      force = body.force === true
      if (Array.isArray(body.pixelSizes)) {
        pixelSizes = body.pixelSizes.filter((s: number) => typeof s === 'number' && s > 0)
      }
    } catch {
      // Empty body
    }

    if (pixelSizes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No pixel sizes specified' },
        { status: 400 }
      )
    }

    // Get size configurations from ThumbnailSize table
    const sizeConfigs = await prisma.thumbnailSize.findMany({
      where: {
        pixelSize: { in: pixelSizes },
        enabled: true,
      },
    })

    if (sizeConfigs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid or enabled sizes found' },
        { status: 400 }
      )
    }

    const validPixelSizes = sizeConfigs.map(s => s.pixelSize)
    const invalidSizes = pixelSizes.filter(px => !validPixelSizes.includes(px))

    if (invalidSizes.length > 0) {
      console.warn(`Skipping invalid/disabled sizes: ${invalidSizes.join(', ')}px`)
    }

    // Get settings
    const settings = await getSyncSettings()

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
        ThumbnailSizes: true,
      },
    })

    // Filter to only those needing generation (unless force=true)
    // A SKU needs generation if it doesn't have all requested sizes
    const skusToProcess = force
      ? skus
      : skus.filter((sku) => {
          if (!sku.ShopifyImageURL) return false
          const existingSizes = sku.ThumbnailSizes
            ? sku.ThumbnailSizes.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
            : []
          // Need to generate if any requested size is missing
          return validPixelSizes.some(px => !existingSizes.includes(px))
        })

    if (skusToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All thumbnails are up to date',
        runId: null,
        totalImages: 0,
      })
    }

    // Create run record (pass pixel sizes as string for logging)
    const runId = await createThumbnailRun(
      validPixelSizes.map(px => `${px}px`) as unknown as string[],
      skusToProcess.length
    )

    // Start background processing (don't await)
    processThumbsInBackground(
      runId,
      skusToProcess,
      sizeConfigs,
      settings.thumbnailSettingsVersion,
      settings.thumbnailBatchConcurrency
    ).catch((err) => {
      console.error('Background thumbnail processing error:', err)
    })

    return NextResponse.json({
      success: true,
      message: `Started generating thumbnails for ${skusToProcess.length} images`,
      runId: runId.toString(),
      totalImages: skusToProcess.length,
      pixelSizes: validPixelSizes,
    })
  } catch (error) {
    console.error('Image generate error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Background thumbnail processing using pixel-based functions
 */
async function processThumbsInBackground(
  runId: bigint,
  skus: Array<{
    ID: bigint
    SkuID: string
    ShopifyImageURL: string | null
    ThumbnailPath: string | null
    ThumbnailSizes: string | null
  }>,
  sizeConfigs: Array<{
    pixelSize: number
    quality: number
    fit: string
    background: string
  }>,
  settingsVersion: number,
  concurrency: number
) {
  let processedCount = 0
  let skippedCount = 0
  let failedCount = 0

  const total = skus.length
  const pixelSizes = sizeConfigs.map(s => s.pixelSize)

  // Convert DB configs to PixelSizeConfig format
  const pixelSizeConfigs: PixelSizeConfig[] = sizeConfigs.map(s => ({
    pixelSize: s.pixelSize,
    quality: s.quality,
    fit: s.fit as 'contain' | 'cover' | 'fill',
    background: parseBackgroundColor(s.background),
  }))

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
              settingsVersion
            )

            // Generate thumbnails using pixel-based function
            const buffers = await generateThumbnailsByPixelSize(
              sku.ShopifyImageURL,
              pixelSizeConfigs
            )

            if (!buffers || buffers.size === 0) {
              return { skuId: sku.SkuID, status: 'failed' as const }
            }

            // Upload to S3 using pixel-based function
            const uploaded = await uploadThumbnailsByPixelSize(cacheKey, buffers)
            if (!uploaded) {
              return { skuId: sku.SkuID, status: 'failed' as const }
            }

            // Update SKU with cache key and ThumbnailSizes
            // Merge new pixel sizes with existing ones
            const existingSizes = sku.ThumbnailSizes
              ? sku.ThumbnailSizes.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
              : []
            const allSizes = [...new Set([...existingSizes, ...pixelSizes])].sort((a, b) => a - b)

            await prisma.sku.update({
              where: { ID: sku.ID },
              data: {
                ThumbnailPath: cacheKey,
                ThumbnailSizes: allSizes.join(','),
              },
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
        currentStep: `Processing ${pixelSizes.join('px, ')}px`,
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
