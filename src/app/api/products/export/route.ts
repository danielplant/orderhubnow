/**
 * Products Export API - XLSX generation with thumbnails
 * Columns: Image | SKU | Color | Description | Material | Available | On Route | Wholesale Price | Retail Price | Collection | Status
 *
 * Groups SKUs by baseSku, sorts by size within each group, shows image only on first row of each group.
 */

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { parsePrice, parseSkuId } from '@/lib/utils'
import { readThumbnail, fetchThumbnail } from '@/lib/utils/thumbnails'

// ============================================================================
// Helpers
// ============================================================================

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t || undefined
}

/**
 * Generate a sort key for sizes to match .NET ordering:
 * - "a" prefix: sizes like 2/3, 4/5 (single digit before slash)
 * - "b" prefix: sizes like 10/12, 14/16 (double digit before slash)
 * - "c" prefix: other sizes (XS, S, M, L, etc.)
 */
function getSizeSortKey(size: string): string {
  if (size.includes('/')) {
    const firstPart = size.split('/')[0]
    if (firstPart.length < 2) {
      return 'a' + size // Single digit: 2/3, 4/5, 6/6X, 7/8
    } else {
      return 'b' + size // Double digit: 10/12, 14/16
    }
  }
  return 'c' + size // Other: XS, S, M, L, XL, etc.
}

const THUMBNAIL_SIZE = 120
const ROW_HEIGHT = 95

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    const tab = getString(searchParams.tab) ?? 'all'
    const q = getString(searchParams.q)
    const collectionIdStr = getString(searchParams.collectionId)
    const collectionId = collectionIdStr ? parseInt(collectionIdStr, 10) : undefined

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

    if (typeof collectionId === 'number' && Number.isFinite(collectionId)) {
      where.CollectionID = collectionId
    }

    // Tab filter
    if (tab === 'ats') {
      where.OR = [{ ShowInPreOrder: false }, { ShowInPreOrder: null }]
    } else if (tab === 'preorder') {
      where.ShowInPreOrder = true
    }

    // Fetch SKUs with all required fields including category name
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
        MSRPCAD: true,
        MSRPUSD: true,
        ShopifyImageURL: true,
        ThumbnailPath: true,
        CollectionID: true,
        Collection: {
          select: { name: true },
        },
      },
    })

    // Parse each SKU to get baseSku and size, then group by baseSku
    const skusWithParsed = rawSkus.map((sku) => {
      const { baseSku, parsedSize } = parseSkuId(sku.SkuID)
      return { ...sku, baseSku, parsedSize }
    })

    // Group by baseSku
    const grouped = new Map<string, typeof skusWithParsed>()
    for (const sku of skusWithParsed) {
      if (!grouped.has(sku.baseSku)) {
        grouped.set(sku.baseSku, [])
      }
      grouped.get(sku.baseSku)!.push(sku)
    }

    // Sort each group by size, then flatten with first-of-group flag
    const skus: Array<typeof skusWithParsed[0] & { isFirstInGroup: boolean }> = []
    const sortedBaseSkus = Array.from(grouped.keys()).sort()

    for (const baseSku of sortedBaseSkus) {
      const group = grouped.get(baseSku)!
      // Sort by size using the .NET-style sort key
      group.sort((a, b) => getSizeSortKey(a.parsedSize).localeCompare(getSizeSortKey(b.parsedSize)))
      // Add to final array with first-of-group flag
      group.forEach((sku, idx) => {
        skus.push({ ...sku, isFirstInGroup: idx === 0 })
      })
    }

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'MyOrderHub'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Products')

    // Headers: Image | SKU | Color | Description | Material | Available | On Route | Wholesale Price | Retail Price | Collection | Status
    sheet.columns = [
      { header: 'Image', key: 'image', width: 18 },
      { header: 'SKU', key: 'sku', width: 25 },
      { header: 'Color', key: 'color', width: 15 },
      { header: 'Description', key: 'description', width: 45 },
      { header: 'Material', key: 'material', width: 25 },
      { header: 'Available', key: 'available', width: 12 },
      { header: 'On Route', key: 'onRoute', width: 12 },
      { header: 'Wholesale Price', key: 'wholesalePrice', width: 25 },
      { header: 'Retail Price', key: 'retailPrice', width: 20 },
      { header: 'Collection', key: 'collection', width: 25 },
      { header: 'Status', key: 'status', width: 12 },
    ]

    // Style header row
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' },
    }
    headerRow.height = 25
    headerRow.alignment = { vertical: 'middle' }

    // Data rows with thumbnails
    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i]
      const rowIndex = i + 2 // 1-based, skip header

      // Format prices
      const priceCad = parsePrice(sku.PriceCAD)
      const priceUsd = parsePrice(sku.PriceUSD)
      const msrpCad = parsePrice(sku.MSRPCAD)
      const msrpUsd = parsePrice(sku.MSRPUSD)

      const wholesalePrice =
        priceCad > 0 || priceUsd > 0
          ? `CAD: ${priceCad.toFixed(2)} / USD: ${priceUsd.toFixed(2)}`
          : ''
      const retailPrice =
        msrpCad > 0 || msrpUsd > 0
          ? `C: ${msrpCad.toFixed(2)}, U: ${msrpUsd.toFixed(2)}`
          : ''

      // Add row data (image cell left empty for now)
      const row = sheet.addRow({
        image: '',
        sku: sku.SkuID,
        color: sku.SkuColor ?? '',
        description: sku.OrderEntryDescription ?? sku.Description ?? '',
        material: sku.FabricContent ?? '',
        available: sku.Quantity ?? 0,
        onRoute: sku.OnRoute ?? 0,
        wholesalePrice,
        retailPrice,
        collection: sku.Collection?.name ?? '',
        status: sku.ShowInPreOrder ? 'Pre-Order' : 'ATS',
      })

      // Set consistent row height
      row.height = ROW_HEIGHT
      row.alignment = { vertical: 'middle' }

      // Add thumbnail image only for first row of each baseSku group
      if (sku.isFirstInGroup) {
        let thumbnailBuffer: Buffer | null = null

        // Try to read pre-generated thumbnail from disk
        if (sku.ThumbnailPath) {
          thumbnailBuffer = readThumbnail(sku.SkuID)
        }

        // Fallback: fetch from Shopify URL if no local thumbnail
        if (!thumbnailBuffer && sku.ShopifyImageURL) {
          thumbnailBuffer = await fetchThumbnail(sku.ShopifyImageURL)
        }

        if (thumbnailBuffer) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imageId = workbook.addImage({
            buffer: thumbnailBuffer as any,
            extension: 'png',
          })

          sheet.addImage(imageId, {
            tl: { col: 0, row: rowIndex - 1 },
            ext: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE },
          })
        }
      }
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Return file
    const filename = `Products_Export_${new Date().toISOString().split('T')[0]}.xlsx`

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
