/**
 * Customers Export API - XLSX generation
 * Matches .NET btnDownloadExistingCutomers_Click functionality
 */

import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Auth check
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all customers
    const rows = await prisma.customers.findMany({
      orderBy: { StoreName: 'asc' },
    })

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'MyOrderHub'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Customers')

    // Define columns (matches .NET export format)
    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'StoreName', key: 'storeName', width: 30 },
      { header: 'CustomerName', key: 'customerName', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Rep', key: 'rep', width: 20 },
      { header: 'Street1', key: 'street1', width: 25 },
      { header: 'Street2', key: 'street2', width: 20 },
      { header: 'City', key: 'city', width: 18 },
      { header: 'StateProvince', key: 'stateProvince', width: 15 },
      { header: 'ZipPostal', key: 'zipPostal', width: 12 },
      { header: 'Country', key: 'country', width: 12 },
      { header: 'ShippingStreet1', key: 'shippingStreet1', width: 25 },
      { header: 'ShippingStreet2', key: 'shippingStreet2', width: 20 },
      { header: 'ShippingCity', key: 'shippingCity', width: 18 },
      { header: 'ShippingStateProvince', key: 'shippingStateProvince', width: 15 },
      { header: 'ShippingZipPostal', key: 'shippingZipPostal', width: 12 },
      { header: 'ShippingCountry', key: 'shippingCountry', width: 12 },
      { header: 'Website', key: 'website', width: 25 },
    ]

    // Style header row
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' },
    }

    // Add data rows
    for (const r of rows) {
      sheet.addRow({
        id: r.ID,
        storeName: r.StoreName ?? '',
        customerName: r.CustomerName ?? '',
        email: r.Email ?? '',
        phone: r.Phone ?? '',
        rep: r.Rep ?? '',
        street1: r.Street1 ?? '',
        street2: r.Street2 ?? '',
        city: r.City ?? '',
        stateProvince: r.StateProvince ?? '',
        zipPostal: r.ZipPostal ?? '',
        country: r.Country ?? '',
        shippingStreet1: r.ShippingStreet1 ?? '',
        shippingStreet2: r.ShippingStreet2 ?? '',
        shippingCity: r.ShippingCity ?? '',
        shippingStateProvince: r.ShippingStateProvince ?? '',
        shippingZipPostal: r.ShippingZipPostal ?? '',
        shippingCountry: r.ShippingCountry ?? '',
        website: r.Website ?? '',
      })
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `LimeappleInventory_Customers_${new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Customers export error:', error)
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 })
  }
}

// Stubs for other methods
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
