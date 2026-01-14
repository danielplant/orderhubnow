/**
 * Orders Export API - XLSX generation
 * Supports: detail, summary, qb formats
 * Matches .NET CustomersOrders.aspx export functionality
 */

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'
import { parseOrdersListInput } from '@/lib/data/queries/orders'
import { extractSize } from '@/lib/utils/size-sort'
import type { OrderStatus } from '@/lib/types/order'

// ============================================================================
// Types
// ============================================================================

interface OrderForExport {
  ID: bigint
  OrderNumber: string
  OrderStatus: string
  StoreName: string
  BuyerName: string
  SalesRep: string
  CustomerEmail: string
  CustomerPhone: string
  Country: string
  OrderAmount: number
  CustomerPO: string
  ShipStartDate: Date
  ShipEndDate: Date
  OrderDate: Date
  IsTransferredToShopify: boolean | null
}

interface OrderItemForExport {
  CustomerOrderID: bigint
  SKU: string
  Quantity: number
  Price: number
  PriceCurrency: string
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
    const format = searchParams.format || 'detail'
    const ids = searchParams.ids ? searchParams.ids.split(',') : []

    // Build where clause (reuse same logic as list query)
    const input = parseOrdersListInput(searchParams)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}

    if (input.q) {
      where.StoreName = { contains: input.q, mode: 'insensitive' }
    }
    if (input.rep) {
      where.SalesRep = { contains: input.rep, mode: 'insensitive' }
    }
    if (input.syncStatus === 'pending') {
      where.OR = [
        { IsTransferredToShopify: false },
        { IsTransferredToShopify: null },
      ]
    }
    if (input.status && input.status !== 'All') {
      where.OrderStatus = input.status
    }

    // For QB export with specific IDs
    if (format === 'qb' && ids.length > 0) {
      where.ID = { in: ids.map((id) => BigInt(id)) }
    }

    // Fetch orders
    const orders = await prisma.customerOrders.findMany({
      where,
      orderBy: { OrderDate: 'desc' },
      select: {
        ID: true,
        OrderNumber: true,
        OrderStatus: true,
        StoreName: true,
        BuyerName: true,
        SalesRep: true,
        CustomerEmail: true,
        CustomerPhone: true,
        Country: true,
        OrderAmount: true,
        CustomerPO: true,
        ShipStartDate: true,
        ShipEndDate: true,
        OrderDate: true,
        IsTransferredToShopify: true,
      },
    })

    // Generate export based on format
    let buffer: ExcelJS.Buffer
    let filename: string

    switch (format) {
      case 'summary':
        buffer = await generateSummaryExport(orders)
        filename = `Orders_Summary_${getDateString()}.xlsx`
        break
      case 'qb':
        buffer = await generateQBExport(orders)
        filename = `Orders_QB_Import_${getDateString()}.xlsx`
        break
      case 'detail':
      default:
        buffer = await generateDetailExport(orders)
        filename = `Orders_Detail_${getDateString()}.xlsx`
        break
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Orders export error:', error)
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 })
  }
}

// ============================================================================
// Export Generators
// ============================================================================

function getDateString(): string {
  return new Date().toISOString().split('T')[0]
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().split('T')[0]
}

/**
 * Detail Export - one row per order with all fields
 */
async function generateDetailExport(orders: OrderForExport[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OrderHub'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Orders Detail')

  // Headers
  sheet.columns = [
    { header: 'Order #', key: 'orderNumber', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Store Name', key: 'storeName', width: 25 },
    { header: 'Buyer Name', key: 'buyerName', width: 20 },
    { header: 'Sales Rep', key: 'salesRep', width: 15 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Country', key: 'country', width: 10 },
    { header: 'Order Amount', key: 'amount', width: 15 },
    { header: 'Customer PO', key: 'customerPO', width: 15 },
    { header: 'Ship Start', key: 'shipStart', width: 12 },
    { header: 'Ship End', key: 'shipEnd', width: 12 },
    { header: 'Order Date', key: 'orderDate', width: 12 },
    { header: 'In Shopify', key: 'inShopify', width: 12 },
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
  for (const order of orders) {
    const isUS = order.Country?.toUpperCase().includes('US')
    sheet.addRow({
      orderNumber: order.OrderNumber,
      status: order.OrderStatus,
      storeName: order.StoreName,
      buyerName: order.BuyerName,
      salesRep: order.SalesRep,
      email: order.CustomerEmail,
      phone: order.CustomerPhone,
      country: order.Country,
      amount: formatCurrency(order.OrderAmount, isUS ? 'USD' : 'CAD'),
      customerPO: order.CustomerPO,
      shipStart: formatDate(order.ShipStartDate),
      shipEnd: formatDate(order.ShipEndDate),
      orderDate: formatDate(order.OrderDate),
      inShopify: order.IsTransferredToShopify ? 'Yes' : 'No',
    })
  }

  return await workbook.xlsx.writeBuffer()
}

/**
 * Summary Export - order totals grouped by status
 */
async function generateSummaryExport(orders: OrderForExport[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OrderHub'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Orders Summary')

  // Group by status
  const byStatus = orders.reduce(
    (acc, order) => {
      const status = order.OrderStatus as OrderStatus
      if (!acc[status]) {
        acc[status] = { count: 0, total: 0 }
      }
      acc[status].count++
      acc[status].total += order.OrderAmount
      return acc
    },
    {} as Record<string, { count: number; total: number }>
  )

  // Headers
  sheet.columns = [
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Order Count', key: 'count', width: 15 },
    { header: 'Total Amount', key: 'total', width: 20 },
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
  let grandTotalCount = 0
  let grandTotalAmount = 0

  for (const [status, data] of Object.entries(byStatus)) {
    sheet.addRow({
      status,
      count: data.count,
      total: formatCurrency(data.total, 'CAD'),
    })
    grandTotalCount += data.count
    grandTotalAmount += data.total
  }

  // Grand total row
  const totalRow = sheet.addRow({
    status: 'TOTAL',
    count: grandTotalCount,
    total: formatCurrency(grandTotalAmount, 'CAD'),
  })
  totalRow.font = { bold: true }

  return await workbook.xlsx.writeBuffer()
}

/**
 * QuickBooks Import Export - one row per line item
 * Matches .NET GenerateOrderImportExcel format
 */
async function generateQBExport(orders: OrderForExport[]): Promise<ExcelJS.Buffer> {
  if (orders.length === 0) {
    // Return empty workbook
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('QB Import')
    return await workbook.xlsx.writeBuffer()
  }

  // Fetch order items for all orders (manual join - no Prisma relation)
  const orderIds = orders.map((o) => o.ID)
  const items = await prisma.customerOrdersItems.findMany({
    where: { CustomerOrderID: { in: orderIds } },
    select: {
      CustomerOrderID: true,
      SKU: true,
      Quantity: true,
      Price: true,
      PriceCurrency: true,
    },
  })

  // Get all unique SKUs to fetch Size from Sku table
  const uniqueSkus = [...new Set(items.map((i) => i.SKU).filter(Boolean))]
  const skuData = await prisma.sku.findMany({
    where: { SkuID: { in: uniqueSkus } },
    select: { SkuID: true, Size: true },
  })
  const skuSizeMap = new Map(skuData.map((s) => [s.SkuID, s.Size || '']))

  // Create lookup map
  const itemsByOrderId = items.reduce(
    (acc, item) => {
      const key = String(item.CustomerOrderID)
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    },
    {} as Record<string, OrderItemForExport[]>
  )

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OrderHub'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('QB Import')

  // QB Import columns (matches .NET format)
  sheet.columns = [
    { header: 'Brand', key: 'brand', width: 12 },
    { header: 'Order Number', key: 'orderNumber', width: 15 },
    { header: 'Order Date', key: 'orderDate', width: 12 },
    { header: 'Ship Date Start', key: 'shipStart', width: 15 },
    { header: 'Ship Date End', key: 'shipEnd', width: 15 },
    { header: 'Ship Window', key: 'shipWindow', width: 20 },
    { header: 'Buyer', key: 'buyer', width: 20 },
    { header: 'Customer Code', key: 'customerCode', width: 15 },
    { header: 'Sales Rep', key: 'salesRep', width: 15 },
    { header: 'Currency Code', key: 'currency', width: 12 },
    { header: 'Order Total', key: 'orderTotal', width: 15 },
    { header: 'SKU', key: 'sku', width: 20 },
    { header: 'Size', key: 'size', width: 10 },
    { header: 'Quantity', key: 'quantity', width: 10 },
    { header: 'Price Per', key: 'price', width: 12 },
    { header: 'Customer PO Number', key: 'customerPO', width: 18 },
    { header: 'Customer Phone', key: 'phone', width: 15 },
    { header: 'Customer Email', key: 'email', width: 25 },
  ]

  // Style header
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F81BD' },
  }

  // Data rows - one per line item
  for (const order of orders) {
    const orderItems = itemsByOrderId[String(order.ID)] || []
    const isUS = order.Country?.toUpperCase().includes('US')

    for (const item of orderItems) {
      // Get size from Sku table (canonical source)
      const size = extractSize(skuSizeMap.get(item.SKU) || '')

      sheet.addRow({
        brand: 'Limeapple',
        orderNumber: order.OrderNumber,
        orderDate: formatDate(order.OrderDate),
        shipStart: formatDate(order.ShipStartDate),
        shipEnd: formatDate(order.ShipEndDate),
        shipWindow: `${formatDate(order.ShipStartDate)} - ${formatDate(order.ShipEndDate)}`,
        buyer: order.BuyerName,
        customerCode: order.StoreName,
        salesRep: order.SalesRep,
        currency: isUS ? 'USD' : 'CAD',
        orderTotal: order.OrderAmount,
        sku: item.SKU,
        size,
        quantity: item.Quantity,
        price: item.Price,
        customerPO: order.CustomerPO,
        phone: order.CustomerPhone,
        email: order.CustomerEmail,
      })
    }
  }

  return await workbook.xlsx.writeBuffer()
}

// Stubs for other methods
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
