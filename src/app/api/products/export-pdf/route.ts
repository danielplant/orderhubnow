/**
 * Products PDF Export API
 *
 * Generates a PDF report of products using puppeteer-core + @sparticuz/chromium.
 * Design: Generic "OrderHub" branding, grayscale, US Letter landscape.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { generatePdf, wrapHtml, formatDate } from '@/lib/pdf/generate'
import { getEffectiveQuantity, parsePrice } from '@/lib/utils'
import { extractSize } from '@/lib/utils/size-sort'

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

    // Fetch SKUs (limit to 300 for PDF)
    const skus = await prisma.sku.findMany({
      where,
      orderBy: { SkuID: 'asc' },
      take: 300,
      select: {
        ID: true,
        SkuID: true,
        Description: true,
        OrderEntryDescription: true,
        SkuColor: true,
        CollectionID: true,
        ShowInPreOrder: true,
        Quantity: true,
        OnRoute: true,
        PriceCAD: true,
        PriceUSD: true,
        Size: true,
      },
    })

    // Get collection name if filtered
    let collectionName: string | null = null
    if (collectionId) {
      const collection = await prisma.collection.findUnique({
        where: { id: collectionId },
        select: { name: true },
      })
      collectionName = collection?.name ?? null
    }

    // Calculate summary stats
    const totalProducts = skus.length
    const totalQuantity = skus.reduce((sum, s) => sum + (s.Quantity ?? 0), 0)
    const totalOnRoute = skus.reduce((sum, s) => sum + (s.OnRoute ?? 0), 0)

    // Generate HTML
    const html = generateProductsPdfHtml(skus, {
      totalProducts,
      totalQuantity,
      totalOnRoute,
      collectionName,
      tab,
    })

    // Generate PDF
    const pdfBuffer = await generatePdf(html, {
      format: 'Letter',
      landscape: true,
    })

    const filename = `Products_Report_${new Date().toISOString().split('T')[0]}.pdf`

    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Products PDF export error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}

// ============================================================================
// HTML Template
// ============================================================================

interface SkuForPdf {
  SkuID: string
  Description: string | null
  OrderEntryDescription: string | null
  SkuColor: string | null
  Quantity: number | null
  OnRoute: number | null
  PriceCAD: string | null
  PriceUSD: string | null
  ShowInPreOrder: boolean | null
  Size: string | null
}

function generateProductsPdfHtml(
  skus: SkuForPdf[],
  summary: {
    totalProducts: number
    totalQuantity: number
    totalOnRoute: number
    collectionName: string | null
    tab: string
  }
): string {
  const now = new Date()

  const tableRows = skus
    .map((sku) => {
      const qty = sku.Quantity ?? 0
      const effectiveQty = getEffectiveQuantity(sku.SkuID, qty)
      const desc = sku.OrderEntryDescription ?? sku.Description ?? ''
      const size = extractSize(sku.Size || '')

      return `
        <tr>
          <td class="font-medium">${sku.SkuID}</td>
          <td class="text-muted">${desc.substring(0, 40)}${desc.length > 40 ? '...' : ''}</td>
          <td class="text-center">${size || '—'}</td>
          <td class="text-right">${qty.toLocaleString()}</td>
          <td class="text-right">${effectiveQty.toLocaleString()}</td>
          <td class="text-right">${(sku.OnRoute ?? 0).toLocaleString()}</td>
          <td class="text-right">$${parsePrice(sku.PriceCAD).toFixed(2)}</td>
          <td class="text-right">$${parsePrice(sku.PriceUSD).toFixed(2)}</td>
        </tr>
      `
    })
    .join('')

  const subtitle = summary.collectionName
    ? `Collection: ${summary.collectionName}`
    : summary.tab === 'ats'
      ? 'Available to Ship'
      : summary.tab === 'preorder'
        ? 'Pre-Order'
        : 'All Products'

  const content = `
    <div class="pdf-header">
      <div class="pdf-header-left">
        <div class="pdf-logo">OrderHub</div>
      </div>
      <div class="pdf-header-right">
        <div class="pdf-title">PRODUCTS REPORT</div>
        <div class="pdf-subtitle">${subtitle}</div>
        <div class="pdf-subtitle">Generated: ${formatDate(now)}</div>
      </div>
    </div>

    <div class="pdf-summary">
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.totalProducts.toLocaleString()}</div>
        <div class="pdf-summary-label">Total SKUs</div>
      </div>
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.totalQuantity.toLocaleString()}</div>
        <div class="pdf-summary-label">Total Quantity</div>
      </div>
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.totalOnRoute.toLocaleString()}</div>
        <div class="pdf-summary-label">On Route</div>
      </div>
    </div>

    <table class="pdf-table">
      <thead>
        <tr>
          <th>SKU ID</th>
          <th>Description</th>
          <th class="text-center">Size</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Eff. Qty</th>
          <th class="text-right">On Route</th>
          <th class="text-right">CAD</th>
          <th class="text-right">USD</th>
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

  return wrapHtml(content, 'Products Report - OrderHub')
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
