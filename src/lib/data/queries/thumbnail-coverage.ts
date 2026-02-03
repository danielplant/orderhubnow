/**
 * Thumbnail Coverage Query
 *
 * Provides coverage analysis for export thumbnail requirements.
 * Used by the coverage gate to determine if exports can proceed.
 *
 * Phase 2: Enforce S3-Only Export Policy
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Thumbnail coverage analysis result for a specific pixel size.
 */
export interface ThumbnailCoverage {
  /** The pixel size being analyzed */
  pixelSize: number
  /** Total SKUs with ShopifyImageURL (can have thumbnails) */
  total: number
  /** SKUs with thumbnail at this size */
  cached: number
  /** SKUs needing thumbnails at this size */
  missing: number
  /** First 100 missing SKU IDs for display */
  missingSkuIds: string[]
  /** Coverage percentage (0-100) */
  coveragePercent: number
}

// Legacy sizes that exist if ThumbnailPath is set but ThumbnailSizes is null
const LEGACY_SIZES = [120, 240, 480, 720]

/**
 * Get thumbnail coverage for a specific pixel size.
 *
 * Used by export routes to determine if coverage is sufficient.
 * Returns list of missing SKU IDs for remediation UI.
 *
 * @param pixelSize - The thumbnail pixel size to check (e.g., 120)
 * @param collectionIds - Optional array of collection IDs to scope the check
 * @returns Coverage analysis with missing SKU IDs
 */
export async function getThumbnailCoverageForExport(
  pixelSize: number,
  collectionIds?: number[]
): Promise<ThumbnailCoverage> {
  // Build where clause
  const whereClause: Prisma.SkuWhereInput = {
    ShopifyImageURL: { not: null },
  }

  // Add collection filter if provided
  if (collectionIds && collectionIds.length > 0) {
    whereClause.CollectionID = { in: collectionIds }
  }

  // Get SKUs with Shopify images (optionally filtered by collection)
  const skus = await prisma.sku.findMany({
    where: whereClause,
    select: {
      SkuID: true,
      ThumbnailPath: true,
      ThumbnailSizes: true,
    },
  })

  const total = skus.length
  let cached = 0
  const missingSkuIds: string[] = []

  for (const sku of skus) {
    let existingSizes: number[]

    if (sku.ThumbnailSizes) {
      // Use the explicit ThumbnailSizes field
      existingSizes = sku.ThumbnailSizes.split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n))
    } else if (sku.ThumbnailPath) {
      // Legacy: ThumbnailPath exists but ThumbnailSizes not populated
      // Assume the standard sizes were generated
      existingSizes = LEGACY_SIZES
    } else {
      existingSizes = []
    }

    if (existingSizes.includes(pixelSize)) {
      cached++
    } else {
      // Only collect first 100 missing SKU IDs for performance
      if (missingSkuIds.length < 100) {
        missingSkuIds.push(sku.SkuID)
      }
    }
  }

  const missing = total - cached
  const coveragePercent = total > 0 ? Math.round((cached / total) * 100) : 100

  return {
    pixelSize,
    total,
    cached,
    missing,
    missingSkuIds,
    coveragePercent,
  }
}

/**
 * Check if export coverage is ready (100%).
 *
 * Convenience function for quick boolean check.
 *
 * @param pixelSize - The thumbnail pixel size to check
 * @param collectionIds - Optional array of collection IDs to scope the check
 * @returns true if all SKUs have thumbnails at this size
 */
export async function isExportCoverageReady(
  pixelSize: number,
  collectionIds?: number[]
): Promise<boolean> {
  const coverage = await getThumbnailCoverageForExport(pixelSize, collectionIds)
  return coverage.coveragePercent === 100
}
