/**
 * Orders PDF Export API
 *
 * Generates a PDF report of orders using puppeteer-core + @sparticuz/chromium.
 * Design: Generic "OrderHub" branding, grayscale, US Letter landscape.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { generatePdf, wrapHtml, formatDate, formatCurrency } from '@/lib/pdf/generate'
import { parseOrdersListInput } from '@/lib/data/queries/orders'

// ============================================================================
// Types
// ============================================================================

interface OrderForPdf {
  OrderNumber: string
  StoreName: string
  OrderStatus: string
  OrderDate: Date
  OrderAmount: number
  SalesRep: string
  Country: string
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
    const input = parseOrdersListInput(searchParams)

    // Build where clause
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
    if (input.dateFrom || input.dateTo) {
      where.OrderDate = {}
      if (input.dateFrom) {
        where.OrderDate.gte = new Date(input.dateFrom + 'T00:00:00')
      }
      if (input.dateTo) {
        where.OrderDate.lte = new Date(input.dateTo + 'T23:59:59.999')
      }
    }

    // Fetch orders (limit to 500 for PDF)
    const orders = await prisma.customerOrders.findMany({
      where,
      orderBy: { OrderDate: 'desc' },
      take: 500,
      select: {
        OrderNumber: true,
        StoreName: true,
        OrderStatus: true,
        OrderDate: true,
        OrderAmount: true,
        SalesRep: true,
        Country: true,
      },
    })

    // Calculate summary stats
    const totalOrders = orders.length
    const totalValue = orders.reduce((sum, o) => sum + o.OrderAmount, 0)
    const statusCounts: Record<string, number> = {}
    for (const order of orders) {
      statusCounts[order.OrderStatus] = (statusCounts[order.OrderStatus] || 0) + 1
    }

    // Generate HTML
    const html = generateOrdersPdfHtml(orders, {
      totalOrders,
      totalValue,
      pendingCount: statusCounts['Pending'] || 0,
      shippedCount: statusCounts['Shipped'] || 0,
      dateRange: input.dateFrom && input.dateTo
        ? `${formatDate(new Date(input.dateFrom))} - ${formatDate(new Date(input.dateTo))}`
        : 'All dates',
    })

    // Generate PDF
    const pdfBuffer = await generatePdf(html, {
      format: 'Letter',
      landscape: true,
    })

    const filename = `Orders_Report_${new Date().toISOString().split('T')[0]}.pdf`

    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Orders PDF export error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}

// ============================================================================
// HTML Template
// ============================================================================

function generateOrdersPdfHtml(
  orders: OrderForPdf[],
  summary: {
    totalOrders: number
    totalValue: number
    pendingCount: number
    shippedCount: number
    dateRange: string
  }
): string {
  const now = new Date()

  const tableRows = orders
    .map(
      (order) => `
      <tr>
        <td class="font-medium">${order.OrderNumber}</td>
        <td>${order.StoreName}</td>
        <td>
          <span class="pdf-status pdf-status-${order.OrderStatus.toLowerCase()}">
            ${order.OrderStatus}
          </span>
        </td>
        <td>${formatDate(order.OrderDate)}</td>
        <td class="text-right">${formatCurrency(order.OrderAmount)}</td>
        <td class="text-muted">${order.SalesRep || '—'}</td>
      </tr>
    `
    )
    .join('')

  const content = `
    <div class="pdf-header">
      <div class="pdf-header-left">
        <div class="pdf-logo">OrderHub</div>
      </div>
      <div class="pdf-header-right">
        <div class="pdf-title">ORDERS REPORT</div>
        <div class="pdf-subtitle">${summary.dateRange}</div>
        <div class="pdf-subtitle">Generated: ${formatDate(now)}</div>
      </div>
    </div>

    <div class="pdf-summary">
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.totalOrders.toLocaleString()}</div>
        <div class="pdf-summary-label">Total Orders</div>
      </div>
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${formatCurrency(summary.totalValue)}</div>
        <div class="pdf-summary-label">Total Value</div>
      </div>
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.pendingCount}</div>
        <div class="pdf-summary-label">Pending</div>
      </div>
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.shippedCount}</div>
        <div class="pdf-summary-label">Shipped</div>
      </div>
    </div>

    <table class="pdf-table">
      <thead>
        <tr>
          <th>Order #</th>
          <th>Store</th>
          <th>Status</th>
          <th>Date</th>
          <th class="text-right">Amount</th>
          <th>Rep</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <div class="pdf-footer">
      <span>Page 1</span>
      <span>Confidential</span>
    </div>
  `

  return wrapHtml(content, 'Orders Report - OrderHub')
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
