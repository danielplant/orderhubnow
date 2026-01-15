/**
 * One-time migration script to migrate local thumbnails to S3
 *
 * This script:
 * 1. Queries all SKUs with thumbnails
 * 2. Regenerates all sizes (120, 240, 480px) from Shopify URLs
 * 3. Uploads to S3
 * 4. Updates the database with cache keys (instead of old file paths)
 *
 * Usage: Call migrateLocalThumbnailsToS3() from an API route or script
 */

import { prisma } from '@/lib/prisma'
import {
  generateThumbnailCacheKey,
  generateThumbnailSizes,
  uploadThumbnailsToS3,
  extractCacheKey,
} from './thumbnails'

export interface MigrationProgress {
  total: number
  processed: number
  migrated: number
  skipped: number
  failed: number
}

export interface MigrationResult {
  success: boolean
  progress: MigrationProgress
  errors: string[]
}

/**
 * Migrate existing local thumbnails to S3
 *
 * @param onProgress - Optional callback for progress updates
 * @returns Migration result with stats
 */
export async function migrateLocalThumbnailsToS3(
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationResult> {
  const progress: MigrationProgress = {
    total: 0,
    processed: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
  }
  const errors: string[] = []

  try {
    // Get all SKUs with thumbnails or Shopify images
    const skus = await prisma.sku.findMany({
      where: {
        OR: [
          { ThumbnailPath: { not: null } },
          { ShopifyImageURL: { not: null } },
        ],
      },
      select: {
        SkuID: true,
        ThumbnailPath: true,
        ShopifyImageURL: true,
      },
    })

    progress.total = skus.length
    console.log(`[Migration] Found ${skus.length} SKUs to process`)

    if (onProgress) onProgress({ ...progress })

    const batchSize = 20
    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize)

      await Promise.all(
        batch.map(async (sku) => {
          try {
            // Check if already migrated (ThumbnailPath is just a 16-char cache key)
            if (sku.ThumbnailPath && /^[a-f0-9]{16}$/.test(sku.ThumbnailPath)) {
              progress.skipped++
              progress.processed++
              return
            }

            // Need Shopify URL to regenerate
            if (!sku.ShopifyImageURL) {
              progress.skipped++
              progress.processed++
              return
            }

            // Generate cache key from current URL
            const cacheKey = generateThumbnailCacheKey(sku.ShopifyImageURL)

            // Check if the expected cache key matches what's stored (old path format)
            const existingCacheKey = extractCacheKey(sku.ThumbnailPath)
            if (existingCacheKey === cacheKey) {
              // Already has correct cache key embedded, just need to regenerate for S3
            }

            // Regenerate all sizes from source URL
            const buffers = await generateThumbnailSizes(sku.ShopifyImageURL)
            if (!buffers) {
              errors.push(`Failed to generate thumbnails for ${sku.SkuID}`)
              progress.failed++
              progress.processed++
              return
            }

            // Upload to S3
            const uploaded = await uploadThumbnailsToS3(cacheKey, buffers)
            if (!uploaded) {
              errors.push(`Failed to upload to S3 for ${sku.SkuID}`)
              progress.failed++
              progress.processed++
              return
            }

            // Update DB with just the cache key
            await prisma.sku.updateMany({
              where: { SkuID: sku.SkuID },
              data: { ThumbnailPath: cacheKey },
            })

            progress.migrated++
            progress.processed++
          } catch (error) {
            const errorMsg = `Error migrating ${sku.SkuID}: ${error instanceof Error ? error.message : 'Unknown error'}`
            errors.push(errorMsg)
            console.error(`[Migration] ${errorMsg}`)
            progress.failed++
            progress.processed++
          }
        })
      )

      if (onProgress) onProgress({ ...progress })

      // Log batch progress
      console.log(
        `[Migration] Progress: ${progress.processed}/${progress.total} ` +
        `(${progress.migrated} migrated, ${progress.skipped} skipped, ${progress.failed} failed)`
      )
    }

    console.log('\n[Migration] Complete!')
    console.log(`  Total: ${progress.total}`)
    console.log(`  Migrated: ${progress.migrated}`)
    console.log(`  Skipped: ${progress.skipped}`)
    console.log(`  Failed: ${progress.failed}`)

    return {
      success: progress.failed === 0,
      progress,
      errors,
    }
  } catch (error) {
    const errorMsg = `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    console.error(`[Migration] ${errorMsg}`)
    errors.push(errorMsg)
    return {
      success: false,
      progress,
      errors,
    }
  }
}

/**
 * Check migration status - how many SKUs have old-style paths vs new cache keys
 */
export async function checkMigrationStatus(): Promise<{
  total: number
  migratedCount: number
  oldStyleCount: number
  noThumbnailCount: number
}> {
  const skus = await prisma.sku.findMany({
    where: {
      ShopifyImageURL: { not: null },
    },
    select: {
      ThumbnailPath: true,
    },
  })

  let migratedCount = 0
  let oldStyleCount = 0
  let noThumbnailCount = 0

  for (const sku of skus) {
    if (!sku.ThumbnailPath) {
      noThumbnailCount++
    } else if (/^[a-f0-9]{16}$/.test(sku.ThumbnailPath)) {
      migratedCount++
    } else {
      oldStyleCount++
    }
  }

  return {
    total: skus.length,
    migratedCount,
    oldStyleCount,
    noThumbnailCount,
  }
}
