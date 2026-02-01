/**
 * Export Policy Query Layer
 *
 * Provides a single source of truth for export configuration.
 * Reads from SyncSettings table with fallback to defaults.
 *
 * Phase 1: Single Source of Truth for Export Policy
 */

import { prisma } from '@/lib/prisma'
import { SYNC_SETTINGS_DEFAULTS } from '@/lib/types/settings'

/**
 * Export policy configuration.
 * Controls how XLSX/PDF exports fetch and display product images.
 */
export interface ExportPolicy {
  /** Pixel size for S3 thumbnails (e.g., 120) */
  thumbnailSize: number
  /** Display width in Excel (e.g., 96 = 1 inch at 96dpi) */
  excelDisplayPx: number
  /** Display width in PDF (e.g., 60) */
  pdfDisplayPx: number
  /** Block export if S3 thumbnail missing (vs allow fallback) */
  requireS3: boolean
  /** Allow Shopify CDN fallback when S3 missing */
  allowShopifyFallback: boolean
  /** Max parallel image fetches during export */
  imageConcurrency: number
}

/**
 * Default export policy values.
 * Matches previous hardcoded values in export-config.ts.
 */
export const EXPORT_POLICY_DEFAULTS: ExportPolicy = {
  thumbnailSize: SYNC_SETTINGS_DEFAULTS.exportThumbnailSize,
  excelDisplayPx: SYNC_SETTINGS_DEFAULTS.exportExcelDisplayPx,
  pdfDisplayPx: SYNC_SETTINGS_DEFAULTS.exportPdfDisplayPx,
  requireS3: SYNC_SETTINGS_DEFAULTS.exportRequireS3,
  allowShopifyFallback: SYNC_SETTINGS_DEFAULTS.exportAllowShopifyFallback,
  imageConcurrency: SYNC_SETTINGS_DEFAULTS.exportImageConcurrency,
}

/**
 * Fetch export policy from database.
 * Returns defaults if no settings exist.
 *
 * This is the single source of truth for export configuration.
 * Use this instead of hardcoded EXPORT_THUMBNAIL constants.
 */
export async function getExportPolicy(): Promise<ExportPolicy> {
  const settings = await prisma.syncSettings.findFirst({
    select: {
      exportThumbnailSize: true,
      exportExcelDisplayPx: true,
      exportPdfDisplayPx: true,
      exportRequireS3: true,
      exportAllowShopifyFallback: true,
      exportImageConcurrency: true,
    },
  })

  if (!settings) {
    return EXPORT_POLICY_DEFAULTS
  }

  return {
    thumbnailSize: settings.exportThumbnailSize,
    excelDisplayPx: settings.exportExcelDisplayPx,
    pdfDisplayPx: settings.exportPdfDisplayPx,
    requireS3: settings.exportRequireS3,
    allowShopifyFallback: settings.exportAllowShopifyFallback,
    imageConcurrency: settings.exportImageConcurrency,
  }
}

/**
 * Update export policy in database.
 * Creates settings record if none exists.
 */
export async function updateExportPolicy(
  policy: Partial<ExportPolicy>
): Promise<ExportPolicy> {
  const existing = await prisma.syncSettings.findFirst()

  const updateData: Record<string, unknown> = {}
  if (policy.thumbnailSize !== undefined) {
    updateData.exportThumbnailSize = policy.thumbnailSize
  }
  if (policy.excelDisplayPx !== undefined) {
    updateData.exportExcelDisplayPx = policy.excelDisplayPx
  }
  if (policy.pdfDisplayPx !== undefined) {
    updateData.exportPdfDisplayPx = policy.pdfDisplayPx
  }
  if (policy.requireS3 !== undefined) {
    updateData.exportRequireS3 = policy.requireS3
  }
  if (policy.allowShopifyFallback !== undefined) {
    updateData.exportAllowShopifyFallback = policy.allowShopifyFallback
  }
  if (policy.imageConcurrency !== undefined) {
    updateData.exportImageConcurrency = policy.imageConcurrency
  }

  if (existing) {
    await prisma.syncSettings.update({
      where: { id: existing.id },
      data: updateData,
    })
  } else {
    // Create new settings with defaults plus updates
    await prisma.syncSettings.create({
      data: {
        ...updateData,
      },
    })
  }

  return getExportPolicy()
}
