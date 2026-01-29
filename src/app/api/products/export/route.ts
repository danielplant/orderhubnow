/**
 * Products Export API - XLSX generation with thumbnails
 *
 * Features:
 * - Groups SKUs by Style (baseSku) with image on first row only
 * - Variable row heights (tall for image row, short for data rows)
 * - Currency toggle (USD / CAD / Both)
 * - Thick border separators between groups
 * - Configurable via export-config.ts
 * - ATS exports: Only SKUs with Available > 0, excludes On Route column
 * - PreOrder exports: All SKUs, includes On Route column
 *
 * Columns: Image | Style | SKU | Description | Color | Material | Size | Available | [On Route] | Collection | Status | Wholesale | Qty
 */

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { parsePrice, getBaseSku, resolveColor } from '@/lib/utils'
import { extractCacheKey, getThumbnailS3Key, fetchAndResizeImage } from '@/lib/utils/thumbnails'
import { getFromS3 } from '@/lib/s3'
import { sortBySize, loadSizeOrderConfig, loadSizeAliasConfig } from '@/lib/utils/size-sort'
import {
  EXPORT_COLUMNS,
  EXPORT_LAYOUT,
  EXPORT_STYLING,
  EXPORT_THUMBNAIL,
} from '@/lib/config/export-config'
import type { CurrencyMode } from '@/lib/types/export'

// ============================================================================
// Helpers
// ============================================================================

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t || undefined
}

/**
 * Format price based on currency mode
 */
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
 * Parse currency mode from query param
 */
function parseCurrencyMode(value: string | undefined): CurrencyMode {
  if (value === 'USD' || value === 'CAD' || value === 'BOTH') {
    return value
  }
  return 'BOTH' // Default
}

/**
 * Fetch thumbnail from S3, falling back to Shopify CDN
 */
async function fetchThumbnailForExport(
  thumbnailRef: string | null,
  shopifyImageUrl: string | null
): Promise<Buffer | null> {
  // Try S3 first
  const cacheKey = extractCacheKey(thumbnailRef)
  if (cacheKey) {
    try {
      const s3Key = getThumbnailS3Key(cacheKey, EXPORT_THUMBNAIL.exportSize)
      const buffer = await getFromS3(s3Key)
      if (buffer) return buffer
    } catch {
      // Fall through to Shopify
    }
  }

  // Fallback: fetch from Shopify URL
  if (shopifyImageUrl) {
    return fetchAndResizeImage(shopifyImageUrl)
  }

  return null
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Auth check - allow both admin and rep roles
    const session = await auth()
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'rep')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    const q = getString(searchParams.q)
    const currency = parseCurrencyMode(getString(searchParams.currency))

    // Parse collections param: 'all' | 'ats' | 'preorder' | '1,2,3'
    const collectionsRaw = getString(searchParams.collections) ?? 'all'

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}

    if (q) {
      where.OR = [
        { SkuID: { contains: q, mode: 'insensitive' } },
        { Description: { contains: q, mode: 'insensitive' } },
        { OrderEntryDescription: { contains: q, mode: 'insensitive' } },
      ]
    }

    // Collections filter
    if (collectionsRaw === 'ats') {
      // Filter to products from ATS-type collections
      where.Collection = { type: 'ATS' }
    } else if (collectionsRaw === 'preorder') {
      // Filter to products from PreOrder-type collections
      where.Collection = { type: 'PreOrder' }
    } else if (collectionsRaw !== 'all' && collectionsRaw !== 'specific') {
      // Parse as comma-separated collection IDs
      const ids = collectionsRaw.split(',').map(Number).filter(Number.isFinite)
      if (ids.length > 0) {
        where.CollectionID = { in: ids }
      }
    }

    // Determine if this is an ATS export (for hiding On Route column)
    const isAtsExport = collectionsRaw === 'ats'

    // Fetch SKUs with all required fields including collection name
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
        Collection: {
          select: { name: true },
        },
      },
    })

    // Parse each SKU to get baseSku and size, then group by baseSku
    const skusWithParsed = rawSkus.map((sku) => {
      const baseSku = getBaseSku(sku.SkuID, sku.Size)
      const size = sku.Size || ''
      return { ...sku, baseSku, size }
    })

    // Group by baseSku
    const grouped = new Map<string, typeof skusWithParsed>()
    for (const sku of skusWithParsed) {
      if (!grouped.has(sku.baseSku)) {
        grouped.set(sku.baseSku, [])
      }
      grouped.get(sku.baseSku)!.push(sku)
    }

    // Load size order and alias config from DB before sorting
    await Promise.all([loadSizeOrderConfig(), loadSizeAliasConfig()])

    // Sort each group by size, then flatten with position flags
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

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'OrderHub'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Products')

    // Filter columns - exclude 'onRoute' for ATS exports
    const exportColumns = isAtsExport
      ? EXPORT_COLUMNS.filter((col) => col.key !== 'onRoute')
      : EXPORT_COLUMNS

    // Track which column keys are numeric for alignment
    const numericColumnKeys = new Set(['available', 'onRoute', 'units', 'orderQty'])

    // Set up columns from config
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

    // Freeze header row if configured
    if (EXPORT_LAYOUT.freezeHeader) {
      sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    }

    // Data rows with thumbnails
    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i]
      const rowIndex = i + 2 // 1-based, skip header

      // Format pack prices based on currency mode
      const priceCad = parsePrice(sku.PriceCAD)
      const priceUsd = parsePrice(sku.PriceUSD)
      const packPrice = formatPrice(priceCad, priceUsd, currency)

      // Format unit prices based on currency mode
      const unitPriceCad = sku.UnitPriceCAD ? Number(sku.UnitPriceCAD) : priceCad
      const unitPriceUsd = sku.UnitPriceUSD ? Number(sku.UnitPriceUSD) : priceUsd
      const unitPrice = formatPrice(unitPriceCad, unitPriceUsd, currency)

      // Units per SKU (1 for singles, 2 for 2PC prepacks, etc.)
      const unitsPerSku = sku.UnitsPerSku ?? 1

      // Resolve description and color with fallbacks
      const description = sku.OrderEntryDescription ?? sku.Description ?? ''
      const color = resolveColor(sku.SkuColor, sku.SkuID, description)

      // Build row data object
      const rowData: Record<string, string | number> = {
        image: '', // Placeholder for image
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
        orderQty: '', // Empty for reps to fill
      }

      // Only include onRoute for non-ATS exports
      if (!isAtsExport) {
        rowData.onRoute = sku.OnRoute ?? 0
      }

      const row = sheet.addRow(rowData)

      // Set row height based on position in group
      if (sku.isFirstInGroup) {
        row.height = EXPORT_LAYOUT.imageRowHeight
      } else {
        row.height = EXPORT_LAYOUT.dataRowHeight
      }

      // Set font for data rows
      row.font = {
        name: EXPORT_STYLING.dataRows.font.name,
        size: EXPORT_STYLING.dataRows.font.size,
        bold: EXPORT_STYLING.dataRows.font.bold,
      }

      // Set alignment - all rows bottom-aligned, first row has text wrapping
      row.alignment = {
        vertical: 'bottom',
        wrapText: sku.isFirstInGroup, // Enable text wrapping on first row
      }

      // Add thin borders to all cells and right-align numeric columns
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        }

        // Right-align numeric columns based on column key
        const colKey = exportColumns[colNumber - 1]?.key
        if (colKey && numericColumnKeys.has(colKey)) {
          cell.alignment = { ...cell.alignment, horizontal: 'right' }
        }
      })

      // Zebra striping - light gray on non-first rows (alternating)
      if (!sku.isFirstInGroup && i % 2 === 1) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }, // Very light gray
          }
        })
      }

      // Add thick border separator at bottom of last row in each group
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

      // Add thumbnail image only for first row of each baseSku group
      if (sku.isFirstInGroup) {
        // Fetch thumbnail from S3 (or fallback to Shopify)
        const thumbnailBuffer = await fetchThumbnailForExport(
          sku.ThumbnailPath,
          sku.ShopifyImageURL
        )

        if (thumbnailBuffer) {
          const imageId = workbook.addImage({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            buffer: thumbnailBuffer as any,
            extension: 'png',
          })

          sheet.addImage(imageId, {
            tl: { col: 0, row: rowIndex - 1 },
            ext: { width: EXPORT_THUMBNAIL.excelDisplayPx, height: EXPORT_THUMBNAIL.excelDisplayPx },
          })
        }
      }
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Return file with currency suffix in filename
    const currencySuffix = currency === 'BOTH' ? '' : `_${currency}`
    const filename = `Products_Export${currencySuffix}_${new Date().toISOString().split('T')[0]}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Products export error:', error)
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 })
  }
}

// Stubs for other methods
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
