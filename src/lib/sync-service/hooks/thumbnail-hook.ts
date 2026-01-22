/**
 * Thumbnail Hook - Generates thumbnails for synced SKUs
 * ============================================================================
 * Runs in post-sync phase to generate thumbnails for products with images.
 *
 * Path: src/lib/sync-service/hooks/thumbnail-hook.ts
 */

import type { SyncHook, HookContext } from '../types/hooks'
import { BUILTIN_HOOKS } from '../types/hooks'
import { getSyncSettings } from '@/lib/data/queries/settings'
import { prisma } from '@/lib/prisma'
import {
  processThumbnailsBatch,
  logThumbnailSyncSummary,
  type ThumbnailSyncItem,
  type ThumbnailGenerationConfig,
} from '@/lib/utils/thumbnails'

/**
 * Parse hex color string to RGBA object for sharp
 */
function parseBackgroundColor(hex: string): { r: number; g: number; b: number; alpha: number } {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) || 255
  const g = parseInt(clean.substring(2, 4), 16) || 255
  const b = parseInt(clean.substring(4, 6), 16) || 255
  return { r, g, b, alpha: 1 }
}

/**
 * Post-sync hook that generates thumbnails for SKUs.
 */
export const thumbnailHook: SyncHook = {
  id: BUILTIN_HOOKS.THUMBNAIL,
  phase: 'post-sync',
  priority: 10, // Run first in post-sync phase
  name: 'Thumbnails',
  description: 'Generates thumbnails for SKUs with Shopify images',
  enabled: true,

  // Only run for full syncs
  onlyForSyncTypes: ['full'],

  async handler(context: HookContext): Promise<void> {
    const { logger, dryRun } = context

    // Check if thumbnails are enabled in settings
    const settings = await getSyncSettings()
    if (!settings.thumbnailEnabled) {
      logger.info('Thumbnails disabled in settings, skipping')
      return
    }

    if (dryRun) {
      logger.info('Dry run mode - skipping thumbnail generation')
      return
    }

    // Get all SKUs that need thumbnail processing
    // (have Shopify image URL but outdated/missing thumbnail)
    logger.info('Fetching SKUs needing thumbnail processing...')

    const skusNeedingThumbnails = await prisma.sku.findMany({
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

    if (skusNeedingThumbnails.length === 0) {
      logger.info('No SKUs need thumbnail processing')
      return
    }

    // Build thumbnail items
    const thumbnailItems: ThumbnailSyncItem[] = skusNeedingThumbnails.map(sku => ({
      skuId: sku.SkuID,
      imageUrl: sku.ShopifyImageURL,
      currentThumbnailPath: sku.ThumbnailPath ?? null,
    }))

    logger.info(`Processing thumbnails for ${thumbnailItems.length} SKUs...`)

    // Build config from DB settings
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

    logger.info(`Using thumbnail config: version=${config.version}, sizes=${JSON.stringify(config.sizes)}`)

    // Process thumbnails with settings from DB
    const { results, stats } = await processThumbnailsBatch(thumbnailItems, {
      concurrency: settings.thumbnailBatchConcurrency,
      config,
      onProgress: (processed, total, currentStats) => {
        if (processed % 100 === 0 || processed === total) {
          logger.info(
            `Progress: ${processed}/${total} (${currentStats.generated} new, ${currentStats.skipped} cached)`
          )
        }
      },
    })

    // Log summary
    logThumbnailSyncSummary(stats)

    // Update SKUs that got new thumbnails
    const updates = results.filter(r => r.status === 'generated' && r.cacheKey)
    let updateCount = 0

    for (const update of updates) {
      await prisma.sku.updateMany({
        where: { SkuID: update.skuId },
        data: { ThumbnailPath: update.cacheKey },
      })
      updateCount++
    }

    logger.info(`Updated ${updateCount} SKU thumbnail references`)
    logger.info(
      `Summary: ${stats.generated} generated, ${stats.skipped} cached, ${stats.failed} failed`
    )
  },
}

export default thumbnailHook
