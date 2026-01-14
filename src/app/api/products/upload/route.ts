/**
 * Products Upload API - Excel import
 * Handles bulk SKU upload from XLSX files
 */

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// ============================================================================
// Types
// ============================================================================

interface UploadRow {
  skuId: string
  description: string
  size: string
  color: string
  quantity: number
  onRoute: number
  priceCad: string
  priceUsd: string
  categoryId?: number
}

interface UploadResult {
  success: boolean
  created: number
  updated: number
  errors: Array<{ row: number; message: string }>
}

// ============================================================================
// Helpers
// ============================================================================

function getCellString(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return ''
  return String(cell.value).trim()
}

function getCellNumber(cell: ExcelJS.Cell | undefined): number {
  if (!cell || cell.value === null || cell.value === undefined) return 0
  const num = Number(cell.value)
  return Number.isFinite(num) ? num : 0
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mode = formData.get('mode') as string | null // 'ats' or 'preorder'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!mode || (mode !== 'ats' && mode !== 'preorder')) {
      return NextResponse.json({ error: 'Invalid mode. Must be "ats" or "preorder"' }, { status: 400 })
    }

    const showInPreOrder = mode === 'preorder'

    // Read file as buffer
    const arrayBuffer = await file.arrayBuffer()

    // Parse Excel
    const workbook = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(arrayBuffer as any)

    const sheet = workbook.getWorksheet(1)
    if (!sheet) {
      return NextResponse.json({ error: 'No worksheet found in file' }, { status: 400 })
    }

    // Expected columns (case-insensitive):
    // SKU, Description, Size, Color, Quantity, OnRoute, PriceCAD, PriceUSD, CategoryID (optional)
    const headerRow = sheet.getRow(1)
    const headers: Record<string, number> = {}

    headerRow.eachCell((cell, colNumber) => {
      const header = getCellString(cell).toLowerCase()
      if (header.includes('sku') && !header.includes('base')) headers.skuId = colNumber
      if (header.includes('description') || header.includes('desc')) headers.description = colNumber
      if (header.includes('size')) headers.size = colNumber
      if (header.includes('color') || header.includes('colour')) headers.color = colNumber
      if (header.includes('quantity') || header.includes('qty')) headers.quantity = colNumber
      if (header.includes('onroute') || header.includes('on route')) headers.onRoute = colNumber
      if (header.includes('pricecad') || header.includes('price cad')) headers.priceCad = colNumber
      if (header.includes('priceusd') || header.includes('price usd')) headers.priceUsd = colNumber
      if (header.includes('category')) headers.categoryId = colNumber
    })

    // Validate required columns
    if (!headers.skuId) {
      return NextResponse.json({
        error: 'Missing required column: SKU. Expected columns: SKU, Description, Size, Color, Quantity, OnRoute, PriceCAD, PriceUSD',
      }, { status: 400 })
    }

    // Parse rows
    const rows: UploadRow[] = []
    const errors: Array<{ row: number; message: string }> = []

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // Skip header

      const skuId = getCellString(row.getCell(headers.skuId))
      if (!skuId) {
        // Skip empty rows
        return
      }

      const uploadRow: UploadRow = {
        skuId,
        description: headers.description ? getCellString(row.getCell(headers.description)) : '',
        size: headers.size ? getCellString(row.getCell(headers.size)) : '',
        color: headers.color ? getCellString(row.getCell(headers.color)) : '',
        quantity: headers.quantity ? getCellNumber(row.getCell(headers.quantity)) : 0,
        onRoute: headers.onRoute ? getCellNumber(row.getCell(headers.onRoute)) : 0,
        priceCad: headers.priceCad ? getCellString(row.getCell(headers.priceCad)) : '',
        priceUsd: headers.priceUsd ? getCellString(row.getCell(headers.priceUsd)) : '',
        categoryId: headers.categoryId ? getCellNumber(row.getCell(headers.categoryId)) || undefined : undefined,
      }

      rows.push(uploadRow)
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid data rows found' }, { status: 400 })
    }

    // Process rows - upsert by SkuID
    let created = 0
    let updated = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // 1-indexed, skip header

      try {
        // Check if SKU exists
        const existing = await prisma.sku.findFirst({
          where: { SkuID: row.skuId },
          select: { ID: true },
        })

        if (existing) {
          // Update
          await prisma.sku.update({
            where: { ID: existing.ID },
            data: {
              Description: row.description || undefined,
              OrderEntryDescription: row.description || undefined,
              Size: row.size || undefined,
              SkuColor: row.color || undefined,
              Quantity: row.quantity,
              OnRoute: row.onRoute,
              PriceCAD: row.priceCad || undefined,
              PriceUSD: row.priceUsd || undefined,
              CategoryID: row.categoryId || undefined,
              ShowInPreOrder: showInPreOrder,
              DateModified: new Date(),
            },
          })
          updated++
        } else {
          // Create
          await prisma.sku.create({
            data: {
              SkuID: row.skuId,
              Description: row.description,
              OrderEntryDescription: row.description,
              Size: row.size,
              SkuColor: row.color,
              Quantity: row.quantity,
              OnRoute: row.onRoute,
              PriceCAD: row.priceCad,
              PriceUSD: row.priceUsd,
              CategoryID: row.categoryId,
              ShowInPreOrder: showInPreOrder,
              DateAdded: new Date(),
              DateModified: new Date(),
            },
          })
          created++
        }
      } catch (err) {
        console.error(`Error processing row ${rowNum}:`, err)
        errors.push({ row: rowNum, message: `Failed to process SKU: ${row.skuId}` })
      }
    }

    // Revalidate products page
    revalidatePath('/admin/products')

    const result: UploadResult = {
      success: errors.length === 0,
      created,
      updated,
      errors,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Products upload error:', error)
    return NextResponse.json({ error: 'Failed to process upload' }, { status: 500 })
  }
}

// Download template
export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'OrderHub'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Products Template')

    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 25 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Size', key: 'size', width: 10 },
      { header: 'Color', key: 'color', width: 15 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'OnRoute', key: 'onRoute', width: 12 },
      { header: 'PriceCAD', key: 'priceCad', width: 12 },
      { header: 'PriceUSD', key: 'priceUsd', width: 12 },
      { header: 'CategoryID', key: 'categoryId', width: 12 },
    ]

    // Style header
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    }

    // Add sample row
    sheet.addRow({
      sku: 'A-1234-BLU-4',
      description: 'Sample Product Blue',
      size: '4',
      color: 'Blue',
      quantity: 100,
      onRoute: 0,
      priceCad: '$29.99',
      priceUsd: '$24.99',
      categoryId: 1,
    })

    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Products_Template.xlsx"',
      },
    })
  } catch (error) {
    console.error('Template generation error:', error)
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 })
  }
}
