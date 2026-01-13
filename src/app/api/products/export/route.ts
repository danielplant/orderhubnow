/**
 * Products Export API - XLSX generation with thumbnails
 * Columns: Image | SKU | Color | Description | Material | Available | On Route | Wholesale Price | Retail Price | Collection | Status
 */

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { parsePrice } from '@/lib/utils'
import { readThumbnail, fetchThumbnail } from '@/lib/utils/thumbnails'

// ============================================================================
// Helpers
// ============================================================================

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t || undefined
}

const THUMBNAIL_SIZE = 100
const ROW_HEIGHT = 80

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
    const skus = await prisma.sku.findMany({
      where,
      orderBy: { SkuID: 'asc' },
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

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'MyOrderHub'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Products')

    // Headers: Image | SKU | Color | Description | Material | Available | On Route | Wholesale Price | Retail Price | Collection | Status
    sheet.columns = [
      { header: 'Image', key: 'image', width: 14 },
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

      // Add thumbnail image if available (prefer local, fallback to fetch)
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
