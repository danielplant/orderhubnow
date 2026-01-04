import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import ExcelJS from 'exceljs'

// ============================================================================
// Types
// ============================================================================

interface CustomerRow {
  StoreName: string
  Email: string
  CustomerName?: string
  Phone?: string
  Rep?: string
  Street1?: string
  Street2?: string
  City?: string
  StateProvince?: string
  ZipPostal?: string
  Country?: string
  Website?: string
}

interface PreviewRow extends CustomerRow {
  rowNumber: number
  errors?: string[]
}

interface ImportResult {
  success: boolean
  preview?: PreviewRow[]
  totalRows?: number
  validRows?: number
  invalidRows?: number
  created?: number
  updated?: number
  errors?: number
  errorDetails?: Array<{ row: number; email: string; error: string }>
  message?: string
}

// Expected column headers (case-insensitive matching)
const COLUMN_MAPPING: Record<string, keyof CustomerRow> = {
  storename: 'StoreName',
  'store name': 'StoreName',
  store: 'StoreName',
  email: 'Email',
  'email address': 'Email',
  customername: 'CustomerName',
  'customer name': 'CustomerName',
  contact: 'CustomerName',
  'contact name': 'CustomerName',
  name: 'CustomerName',
  phone: 'Phone',
  'phone number': 'Phone',
  telephone: 'Phone',
  rep: 'Rep',
  representative: 'Rep',
  'sales rep': 'Rep',
  salesrep: 'Rep',
  street1: 'Street1',
  'street 1': 'Street1',
  address: 'Street1',
  'address 1': 'Street1',
  address1: 'Street1',
  street2: 'Street2',
  'street 2': 'Street2',
  'address 2': 'Street2',
  address2: 'Street2',
  city: 'City',
  stateprovince: 'StateProvince',
  'state province': 'StateProvince',
  state: 'StateProvince',
  province: 'StateProvince',
  zippostal: 'ZipPostal',
  'zip postal': 'ZipPostal',
  zip: 'ZipPostal',
  postal: 'ZipPostal',
  'postal code': 'ZipPostal',
  'zip code': 'ZipPostal',
  postalcode: 'ZipPostal',
  zipcode: 'ZipPostal',
  country: 'Country',
  website: 'Website',
  url: 'Website',
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeHeader(header: string): keyof CustomerRow | null {
  const normalized = header.toLowerCase().trim()
  return COLUMN_MAPPING[normalized] || null
}

function validateRow(row: CustomerRow, rowNumber: number): string[] {
  const errors: string[] = []

  if (!row.StoreName?.trim()) {
    errors.push('StoreName is required')
  }
  if (!row.Email?.trim()) {
    errors.push('Email is required')
  } else if (!row.Email.includes('@')) {
    errors.push('Invalid email format')
  }

  return errors
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse<ImportResult>> {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mode = formData.get('mode') as 'preview' | 'import' | null

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file uploaded' },
        { status: 400 }
      )
    }

    // Validate file type
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json(
        { success: false, message: 'Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      )
    }

    // Read the file
    const arrayBuffer = await file.arrayBuffer()

    // Parse with ExcelJS
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)

    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      return NextResponse.json(
        { success: false, message: 'No worksheet found in the Excel file' },
        { status: 400 }
      )
    }

    // Get headers from first row
    const headerRow = worksheet.getRow(1)
    const columnMap: Map<number, keyof CustomerRow> = new Map()

    headerRow.eachCell((cell, colNumber) => {
      const headerValue = cell.value?.toString() || ''
      const mappedField = normalizeHeader(headerValue)
      if (mappedField) {
        columnMap.set(colNumber, mappedField)
      }
    })

    // Validate required columns
    const hasStoreName = Array.from(columnMap.values()).includes('StoreName')
    const hasEmail = Array.from(columnMap.values()).includes('Email')

    if (!hasStoreName || !hasEmail) {
      return NextResponse.json(
        {
          success: false,
          message: `Missing required columns. Found: ${Array.from(columnMap.values()).join(', ')}. Required: StoreName, Email`,
        },
        { status: 400 }
      )
    }

    // Parse data rows
    const rows: PreviewRow[] = []
    let validCount = 0
    let invalidCount = 0

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // Skip header row

      const customerRow: CustomerRow = {
        StoreName: '',
        Email: '',
      }

      row.eachCell((cell, colNumber) => {
        const field = columnMap.get(colNumber)
        if (field) {
          const value = cell.value?.toString()?.trim() || ''
          customerRow[field] = value
        }
      })

      // Skip completely empty rows
      if (!customerRow.StoreName && !customerRow.Email) {
        return
      }

      const errors = validateRow(customerRow, rowNumber)
      if (errors.length > 0) {
        invalidCount++
      } else {
        validCount++
      }

      rows.push({
        ...customerRow,
        rowNumber,
        errors: errors.length > 0 ? errors : undefined,
      })
    })

    // Preview mode - just return parsed data
    if (mode === 'preview' || !mode) {
      return NextResponse.json({
        success: true,
        preview: rows.slice(0, 10), // Return first 10 for preview
        totalRows: rows.length,
        validRows: validCount,
        invalidRows: invalidCount,
      })
    }

    // Import mode - actually import the data
    let created = 0
    let updated = 0
    let errors = 0
    const errorDetails: Array<{ row: number; email: string; error: string }> = []

    for (const row of rows) {
      // Skip invalid rows
      if (row.errors && row.errors.length > 0) {
        errors++
        errorDetails.push({
          row: row.rowNumber,
          email: row.Email || '(no email)',
          error: row.errors.join(', '),
        })
        continue
      }

      try {
        // Check if customer exists by email
        const existing = await prisma.customers.findFirst({
          where: { Email: row.Email },
          select: { ID: true },
        })

        const data = {
          StoreName: row.StoreName.trim(),
          Email: row.Email.trim(),
          CustomerName: row.CustomerName?.trim() || null,
          Phone: row.Phone?.trim() || null,
          Rep: row.Rep?.trim() || null,
          Street1: row.Street1?.trim() || null,
          Street2: row.Street2?.trim() || null,
          City: row.City?.trim() || null,
          StateProvince: row.StateProvince?.trim() || null,
          ZipPostal: row.ZipPostal?.trim() || null,
          Country: row.Country?.trim() || null,
          Website: row.Website?.trim() || null,
        }

        if (existing) {
          await prisma.customers.update({
            where: { ID: existing.ID },
            data,
          })
          updated++
        } else {
          await prisma.customers.create({ data })
          created++
        }
      } catch (err) {
        errors++
        errorDetails.push({
          row: row.rowNumber,
          email: row.Email,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      errors,
      errorDetails: errorDetails.slice(0, 50),
      message: `Import complete: ${created} created, ${updated} updated, ${errors} errors`,
    })
  } catch (err) {
    console.error('Excel import error:', err)
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to process Excel file',
      },
      { status: 500 }
    )
  }
}
