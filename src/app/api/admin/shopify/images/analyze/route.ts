import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getSyncSettings } from '@/lib/data/queries/settings'

/**
 * GET /api/admin/shopify/images/analyze
 *
 * Analyzes how many thumbnails need to be generated per pixel size.
 * Uses ThumbnailSize table to determine which sizes to check.
 * Uses SKU.ThumbnailSizes DB field for quick boolean check (no S3 calls).
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get settings
    const settings = await getSyncSettings()

    // Get enabled pixel sizes from ThumbnailSize table
    const sizes = await prisma.thumbnailSize.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    })

    const pixelSizes = sizes.map(s => s.pixelSize)

    if (pixelSizes.length === 0) {
      return NextResponse.json({
        byPixelSize: {},
        totalSkusWithImages: 0,
        needsGenerationCount: 0,
        estimatedTimeMinutes: 0,
      })
    }

    // Get all SKUs with Shopify images
    const skus = await prisma.sku.findMany({
      where: {
        ShopifyImageURL: { not: null },
      },
      select: {
        ThumbnailPath: true,
        ThumbnailSizes: true,
      },
    })

    const totalSkusWithImages = skus.length

    // Initialize counts per size
    const byPixelSize: Record<number, { cached: number; needed: number }> = {}
    for (const size of pixelSizes) {
      byPixelSize[size] = { cached: 0, needed: 0 }
    }

    // Legacy sizes that exist if ThumbnailPath is set but ThumbnailSizes is null
    const LEGACY_SIZES = [120, 240, 480, 720]

    // Quick boolean check: parse ThumbnailSizes field for each SKU
    for (const sku of skus) {
      let existingSizes: number[]

      if (sku.ThumbnailSizes) {
        // Use the explicit ThumbnailSizes field
        existingSizes = sku.ThumbnailSizes.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      } else if (sku.ThumbnailPath) {
        // Legacy: ThumbnailPath exists but ThumbnailSizes not populated
        // Assume the standard sizes were generated
        existingSizes = LEGACY_SIZES
      } else {
        existingSizes = []
      }

      for (const pixelSize of pixelSizes) {
        if (existingSizes.includes(pixelSize)) {
          byPixelSize[pixelSize].cached++
        } else {
          byPixelSize[pixelSize].needed++
        }
      }
    }

    // Overall needs count (max across all sizes)
    const needsGenerationCount = Math.max(
      0,
      ...Object.values(byPixelSize).map(v => v.needed)
    )

    // Estimate time based on concurrency
    const imagesPerMinute = settings.thumbnailBatchConcurrency * 6
    const estimatedTimeMinutes = Math.ceil(needsGenerationCount / imagesPerMinute)

    return NextResponse.json({
      byPixelSize,
      totalSkusWithImages,
      needsGenerationCount,
      estimatedTimeMinutes,
    })
  } catch (error) {
    console.error('Image analyze error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
