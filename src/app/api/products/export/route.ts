/**
 * Products Export API - XLSX generation
 * Matches admin products page filters
 */

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getEffectiveQuantity, parsePrice, parseSkuId } from '@/lib/utils'

// ============================================================================
// Helpers
// ============================================================================

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t || undefined
}

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
    const categoryIdStr = getString(searchParams.categoryId)
    const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : undefined

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

    if (typeof categoryId === 'number' && Number.isFinite(categoryId)) {
      where.CategoryID = categoryId
    }

    // Tab filter
    if (tab === 'ats') {
      where.OR = [{ ShowInPreOrder: false }, { ShowInPreOrder: null }]
    } else if (tab === 'preorder') {
      where.ShowInPreOrder = true
    }

    // Fetch SKUs
    const skus = await prisma.sku.findMany({
      where,
      orderBy: { SkuID: 'asc' },
      select: {
        ID: true,
        SkuID: true,
        Description: true,
        OrderEntryDescription: true,
        SkuColor: true,
        CategoryID: true,
        ShowInPreOrder: true,
        Quantity: true,
        OnRoute: true,
        PriceCAD: true,
        PriceUSD: true,
        DateAdded: true,
        DateModified: true,
      },
    })

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'MyOrderHub'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Products')

    // Headers
    sheet.columns = [
      { header: 'SKU ID', key: 'skuId', width: 25 },
      { header: 'Base SKU', key: 'baseSku', width: 20 },
      { header: 'Size', key: 'size', width: 10 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Color', key: 'color', width: 15 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Effective Qty', key: 'effectiveQty', width: 12 },
      { header: 'On Route', key: 'onRoute', width: 12 },
      { header: 'Price CAD', key: 'priceCad', width: 12 },
      { header: 'Price USD', key: 'priceUsd', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Date Added', key: 'dateAdded', width: 12 },
      { header: 'Date Modified', key: 'dateModified', width: 12 },
    ]

    // Style header
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' },
    }

    // Data rows
    for (const sku of skus) {
      const qty = sku.Quantity ?? 0
      const { baseSku, parsedSize } = parseSkuId(sku.SkuID)
      sheet.addRow({
        skuId: sku.SkuID,
        baseSku,
        size: parsedSize,
        description: sku.OrderEntryDescription ?? sku.Description ?? '',
        color: sku.SkuColor ?? '',
        quantity: qty,
        effectiveQty: getEffectiveQuantity(sku.SkuID, qty),
        onRoute: sku.OnRoute ?? 0,
        priceCad: parsePrice(sku.PriceCAD),
        priceUsd: parsePrice(sku.PriceUSD),
        status: sku.ShowInPreOrder ? 'Pre-Order' : 'ATS',
        dateAdded: sku.DateAdded ? sku.DateAdded.toISOString().split('T')[0] : '',
        dateModified: sku.DateModified ? sku.DateModified.toISOString().split('T')[0] : '',
      })
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
