/**
 * XLSX Export Generator
 *
 * Generates Excel workbooks from product data with:
 * - SKUs grouped by Style (baseSku) with image on first row only
 * - Variable row heights (tall for image row, short for data rows)
 * - Currency toggle (USD / CAD / Both)
 * - Thick border separators between groups
 * - Role-based thumbnail fallback policy
 *
 * Extracted from api/products/export/route.ts for use in background jobs.
 *
 * Phase 3: Durable Background Jobs
 */

import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'
import { parsePrice, getBaseSku, resolveColor } from '@/lib/utils'
import { sortBySize, loadSizeOrderConfig, loadSizeAliasConfig } from '@/lib/utils/size-sort'
import {
  EXPORT_COLUMNS,
  EXPORT_LAYOUT,
  EXPORT_STYLING,
} from '@/lib/config/export-config'
import { type ExportPolicy } from '@/lib/data/queries/export-policy'
import { fetchThumbnailForExport } from './thumbnail-fetcher'
import type { CurrencyMode } from '@/lib/types/export'

// ============================================================================
// Types
// ============================================================================

export interface XlsxExportFilters {
  collections?: string // 'all' | 'ats' | 'preorder' | '1,2,3'
  currency?: string // 'CAD' | 'USD' | 'BOTH'
  q?: string // Search query
}

export interface XlsxExportMetrics {
  totalSkus: number
  totalStyles: number
  imagesProcessed: number
  s3Hits: number
  shopifyFallbacks: number
  failures: number
  durationMs: number
}

export type ProgressCallback = (
  step: string,
  detail: string,
  percent: number,
  metrics?: Partial<XlsxExportMetrics>
) => Promise<void>

export interface XlsxExportResult {
  buffer: Buffer
  filename: string
  metrics: XlsxExportMetrics
}

// ============================================================================
// Helpers
// ============================================================================

function parseCurrencyMode(value: string | undefined): CurrencyMode {
  if (value === 'USD' || value === 'CAD' || value === 'BOTH') {
    return value
  }
  return 'BOTH'
}

function formatPrice(priceCAD: number, priceUSD: number, mode: CurrencyMode): string {
  switch (mode) {
    case 'USD':
      return priceUSD > 0 ? `USD $${priceUSD.toFixed(2)}` : ''
    case 'CAD':
      return priceCAD > 0 ? `CAD $${priceCAD.toFixed(2)}` : ''
    case 'BOTH':
      if (priceCAD > 0 || priceUSD > 0) {
        return `CAD $${priceCAD.toFixed(2)} / USD $${priceUSD.toFixed(2)}`
      }
      return ''
  }
}

/**
 * Check if a job has been cancelled
 */
async function checkCancelled(jobId: string | undefined): Promise<boolean> {
  if (!jobId) return false
  const job = await prisma.exportJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  })
  return job?.status === 'cancelled'
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate XLSX export buffer with progress tracking.
 *
 * @param filters - Collection, currency, and search filters
 * @param policy - Export policy from DB (thumbnail size, fallback settings)
 * @param userRole - 'admin' or 'rep' - affects thumbnail fallback behavior
 * @param onProgress - Callback for progress updates (for job tracking)
 * @param jobId - Optional job ID for cancellation checking (not used in sync mode)
 */
export async function generateXlsxExport(
  filters: XlsxExportFilters,
  policy: ExportPolicy,
  userRole: 'admin' | 'rep',
  onProgress: ProgressCallback,
  jobId?: string
): Promise<XlsxExportResult> {
  const startTime = Date.now()

  const metrics: XlsxExportMetrics = {
    totalSkus: 0,
    totalStyles: 0,
    imagesProcessed: 0,
    s3Hits: 0,
    shopifyFallbacks: 0,
    failures: 0,
    durationMs: 0,
  }

  // -------------------------------------------------------------------------
  // Step 1: Build where clause
  // -------------------------------------------------------------------------
  await onProgress('querying', 'Building query filters', 5)

  const collectionsRaw = filters.collections ?? 'all'
  const currency = parseCurrencyMode(filters.currency)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (filters.q) {
    where.OR = [
      { SkuID: { contains: filters.q } },
      { Description: { contains: filters.q } },
      { OrderEntryDescription: { contains: filters.q } },
    ]
  }

  // Collections filter
  if (collectionsRaw === 'ats') {
    where.Collection = { type: 'ATS' }
  } else if (collectionsRaw === 'preorder') {
    where.Collection = { type: 'PreOrder' }
  } else if (collectionsRaw !== 'all' && collectionsRaw !== 'specific') {
    const ids = collectionsRaw.split(',').map(Number).filter(Number.isFinite)
    if (ids.length > 0) {
      where.CollectionID = { in: ids }
    }
  }

  const isAtsExport = collectionsRaw === 'ats'

  // -------------------------------------------------------------------------
  // Step 2: Fetch SKUs
  // -------------------------------------------------------------------------
  await onProgress('querying', 'Fetching product data from database', 10)

  const rawSkus = await prisma.sku.findMany({
    where,
    select: {
      ID: true,
      SkuID: true,
      Description: true,
      OrderEntryDescription: true,
      SkuColor: true,
      FabricContent: true,
      ShowInPreOrder: true,
      Quantity: true,
      OnRoute: true,
      PriceCAD: true,
      PriceUSD: true,
      UnitsPerSku: true,
      UnitPriceCAD: true,
      UnitPriceUSD: true,
      ShopifyImageURL: true,
      ThumbnailPath: true,
      CollectionID: true,
      Size: true,
      Collection: { select: { name: true } },
    },
  })

  // -------------------------------------------------------------------------
  // Step 3: Group and sort SKUs
  // -------------------------------------------------------------------------
  await onProgress('querying', 'Grouping and sorting products', 15)

  const skusWithParsed = rawSkus.map((sku) => {
    const baseSku = getBaseSku(sku.SkuID, sku.Size)
    const size = sku.Size || ''
    return { ...sku, baseSku, size }
  })

  const grouped = new Map<string, typeof skusWithParsed>()
  for (const sku of skusWithParsed) {
    if (!grouped.has(sku.baseSku)) {
      grouped.set(sku.baseSku, [])
    }
    grouped.get(sku.baseSku)!.push(sku)
  }

  // Load size order config
  await Promise.all([loadSizeOrderConfig(), loadSizeAliasConfig()])

  const skus: Array<
    (typeof skusWithParsed)[0] & { isFirstInGroup: boolean; isLastInGroup: boolean }
  > = []
  const sortedBaseSkus = Array.from(grouped.keys()).sort()

  for (const baseSku of sortedBaseSkus) {
    const group = grouped.get(baseSku)!
    const sortedGroup = sortBySize(group)
    sortedGroup.forEach((sku, idx) => {
      skus.push({
        ...sku,
        isFirstInGroup: idx === 0,
        isLastInGroup: idx === sortedGroup.length - 1,
      })
    })
  }

  metrics.totalSkus = skus.length
  metrics.totalStyles = sortedBaseSkus.length

  // -------------------------------------------------------------------------
  // Step 4: Create workbook and sheet
  // -------------------------------------------------------------------------
  await onProgress('generating', 'Creating workbook structure', 20)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OrderHub'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Products')

  // Filter columns - exclude 'onRoute' for ATS exports
  const exportColumns = isAtsExport
    ? EXPORT_COLUMNS.filter((col) => col.key !== 'onRoute')
    : EXPORT_COLUMNS

  const numericColumnKeys = new Set(['available', 'onRoute', 'units', 'orderQty'])

  sheet.columns = exportColumns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width,
  }))

  // Style header row
  const headerRow = sheet.getRow(1)
  headerRow.font = {
    name: EXPORT_STYLING.header.font.name,
    size: EXPORT_STYLING.header.font.size,
    bold: EXPORT_STYLING.header.font.bold,
    color: { argb: EXPORT_STYLING.header.textColor },
  }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: EXPORT_STYLING.header.bgColor },
  }
  headerRow.height = EXPORT_LAYOUT.headerRowHeight
  headerRow.alignment = { vertical: 'middle' }

  if (EXPORT_LAYOUT.freezeHeader) {
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  }

  // -------------------------------------------------------------------------
  // Step 5: Add data rows with thumbnails
  // -------------------------------------------------------------------------
  const firstRowSkus = skus.filter((s) => s.isFirstInGroup)
  const totalImages = firstRowSkus.length

  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i]
    const rowIndex = i + 2

    // Format prices
    const priceCad = parsePrice(sku.PriceCAD)
    const priceUsd = parsePrice(sku.PriceUSD)
    const packPrice = formatPrice(priceCad, priceUsd, currency)

    const unitPriceCad = sku.UnitPriceCAD ? Number(sku.UnitPriceCAD) : priceCad
    const unitPriceUsd = sku.UnitPriceUSD ? Number(sku.UnitPriceUSD) : priceUsd
    const unitPrice = formatPrice(unitPriceCad, unitPriceUsd, currency)

    const unitsPerSku = sku.UnitsPerSku ?? 1
    const description = sku.OrderEntryDescription ?? sku.Description ?? ''
    const color = resolveColor(sku.SkuColor, sku.SkuID, description)

    // Build row data
    const rowData: Record<string, string | number> = {
      image: '',
      baseSku: sku.isFirstInGroup ? sku.baseSku : '',
      sku: sku.SkuID,
      description: sku.isFirstInGroup ? description : '',
      color: sku.isFirstInGroup ? color : '',
      material: sku.isFirstInGroup ? (sku.FabricContent ?? '') : '',
      size: sku.size,
      available: sku.Quantity ?? 0,
      collection: sku.isFirstInGroup ? (sku.Collection?.name ?? '') : '',
      status: sku.isFirstInGroup ? (sku.ShowInPreOrder ? 'Pre-Order' : 'ATS') : '',
      units: sku.isFirstInGroup ? unitsPerSku : '',
      packPrice: sku.isFirstInGroup ? packPrice : '',
      unitPrice: sku.isFirstInGroup ? unitPrice : '',
      orderQty: '',
    }

    if (!isAtsExport) {
      rowData.onRoute = sku.OnRoute ?? 0
    }

    const row = sheet.addRow(rowData)

    // Set row height
    if (sku.isFirstInGroup) {
      row.height = EXPORT_LAYOUT.imageRowHeight
    } else {
      row.height = EXPORT_LAYOUT.dataRowHeight
    }

    // Style data row
    row.font = {
      name: EXPORT_STYLING.dataRows.font.name,
      size: EXPORT_STYLING.dataRows.font.size,
      bold: EXPORT_STYLING.dataRows.font.bold,
    }

    row.alignment = {
      vertical: 'bottom',
      wrapText: sku.isFirstInGroup,
    }

    // Add borders and alignment
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }

      const colKey = exportColumns[colNumber - 1]?.key
      if (colKey && numericColumnKeys.has(colKey)) {
        cell.alignment = { ...cell.alignment, horizontal: 'right' }
      }
    })

    // Zebra striping
    if (!sku.isFirstInGroup && i % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        }
      })
    }

    // Group separator
    if (sku.isLastInGroup) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          ...cell.border,
          bottom: {
            style: EXPORT_STYLING.groupSeparator.borderStyle,
            color: { argb: EXPORT_STYLING.groupSeparator.borderColor },
          },
        }
      })
    }

    // Fetch and add thumbnail for first row of each group
    if (sku.isFirstInGroup) {
      metrics.imagesProcessed++

      const { buffer: thumbnailBuffer, source } = await fetchThumbnailForExport(
        sku.ThumbnailPath,
        sku.ShopifyImageURL,
        policy,
        userRole
      )

      if (source === 's3') metrics.s3Hits++
      else if (source === 'shopify') metrics.shopifyFallbacks++
      else metrics.failures++

      if (thumbnailBuffer) {
        const imageId = workbook.addImage({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          buffer: thumbnailBuffer as any,
          extension: 'png',
        })

        sheet.addImage(imageId, {
          tl: { col: 0, row: rowIndex - 1 },
          ext: { width: policy.excelDisplayPx, height: policy.excelDisplayPx },
        })
      }

      // Update progress every 10 images or at the end
      if (metrics.imagesProcessed % 10 === 0 || metrics.imagesProcessed === totalImages) {
        const percent = 20 + Math.round((metrics.imagesProcessed / totalImages) * 60)
        await onProgress(
          'fetching_images',
          `Processed ${metrics.imagesProcessed}/${totalImages} images`,
          percent,
          metrics
        )

        // Check for cancellation every 10 images to allow early exit
        if (await checkCancelled(jobId)) {
          throw new Error('Export cancelled by user')
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Generate buffer
  // -------------------------------------------------------------------------
  await onProgress('generating', 'Finalizing workbook', 85)

  const buffer = await workbook.xlsx.writeBuffer()

  metrics.durationMs = Date.now() - startTime

  // Generate filename
  const currencySuffix = currency === 'BOTH' ? '' : `_${currency}`
  const filename = `Products_Export${currencySuffix}_${new Date().toISOString().split('T')[0]}.xlsx`

  return {
    buffer: Buffer.from(buffer),
    filename,
    metrics,
  }
}
