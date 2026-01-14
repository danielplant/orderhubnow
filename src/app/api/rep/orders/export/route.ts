/**
 * Rep Orders Export API - XLSX generation (8 columns)
 * Matches .NET ExcelOrdersRep class format
 */

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth/providers'
import { getOrdersByRep } from '@/lib/data/queries/orders'

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Auth check - must be rep with valid repId
    const session = await auth()
    if (!session?.user || session.user.role !== 'rep' || !session.user.repId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params (preserve filters, ignore pagination)
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    
    // Get all orders matching current filters (no pagination for export)
    const { orders } = await getOrdersByRep(session.user.repId, {
      ...searchParams,
      pageSize: '10000', // Get all matching orders
    })

    // Build Excel workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'OrderHub'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Customers Orders')

    // Headers (8 columns per .NET ExcelOrdersRep)
    sheet.columns = [
      { header: 'OrderNumber', key: 'orderNumber', width: 15 },
      { header: 'OrderDate', key: 'orderDate', width: 12 },
      { header: 'StoreName', key: 'storeName', width: 25 },
      { header: 'SalesRep', key: 'salesRep', width: 15 },
      { header: 'OrderTotal', key: 'orderTotal', width: 15 },
      { header: 'ShipWindow', key: 'shipWindow', width: 25 },
      { header: 'OrderStatus', key: 'orderStatus', width: 12 },
      { header: 'Category', key: 'category', width: 30 },
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
    for (const order of orders) {
      const shipWindow =
        order.shipStartDate && order.shipEndDate
          ? `${order.shipStartDate} - ${order.shipEndDate}`
          : ''

      sheet.addRow({
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        storeName: order.storeName,
        salesRep: order.salesRep,
        orderTotal: order.orderAmountFormatted,
        shipWindow,
        orderStatus: order.status,
        category: order.category,
      })
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:-]/g, '')
    const filename = `Limeapple-RepOrders-${timestamp}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Rep orders export error:', error)
    return NextResponse.json(
      { error: 'Failed to generate export' },
      { status: 500 }
    )
  }
}
