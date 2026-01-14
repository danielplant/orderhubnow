/**
 * Products PDF Export API
 *
 * Generates a PDF report of products using puppeteer-core + @sparticuz/chromium.
 * Design: Matches XLSX export layout with product images and style grouping.
 *
 * Features:
 * - Groups SKUs by Style (baseSku) with image on first row only
 * - Currency toggle (USD / CAD / Both)
 * - Thick border separators between groups
 * - Same columns as XLSX: Image | Style | SKU | Description | Color | Material | Size | Available | On Route | Collection | Status | Wholesale | Qty
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { generatePdf, wrapHtml, formatDate } from '@/lib/pdf/generate'
import { parsePrice, parseSkuId, resolveColor } from '@/lib/utils'
import { extractSize, sortBySize } from '@/lib/utils/size-sort'
import type { CurrencyMode } from '@/lib/types/export'

// ============================================================================
// Helpers
// ============================================================================

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t || undefined
}

/**
 * Parse currency mode from query param
 */
function parseCurrencyMode(value: string | undefined): CurrencyMode {
  if (value === 'USD' || value === 'CAD' || value === 'BOTH') {
    return value
  }
  return 'BOTH' // Default
}

/**
 * Format price based on currency mode
 */
function formatPrice(priceCAD: number, priceUSD: number, mode: CurrencyMode): string {
  switch (mode) {
    case 'USD':
      return priceUSD > 0 ? `USD $${priceUSD.toFixed(2)}` : ''
    case 'CAD':
      return priceCAD > 0 ? `CAD $${priceCAD.toFixed(2)}` : ''
    case 'BOTH':
      if (priceCAD > 0 || priceUSD > 0) {
        return `CAD $${priceCAD.toFixed(2)} / USD $${priceUSD.toFixed(2)}`
      }
      return ''
  }
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
    const currency = parseCurrencyMode(getString(searchParams.currency))

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
      where.AND = [
        { OR: [{ ShowInPreOrder: false }, { ShowInPreOrder: null }] },
      ]
    } else if (tab === 'preorder') {
      where.ShowInPreOrder = true
    }

    // PDF always filters out 0-availability SKUs
    where.Quantity = { gte: 1 }

    // Fetch SKUs with all required fields including collection name (limit to 300 for PDF)
    const rawSkus = await prisma.sku.findMany({
      where,
      orderBy: { SkuID: 'asc' },
      take: 300,
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
        ShopifyImageURL: true,
        ThumbnailPath: true,
        CollectionID: true,
        Size: true,
        Collection: {
          select: { name: true },
        },
      },
    })

    // Parse each SKU to get baseSku and size, then group by baseSku
    const skusWithParsed = rawSkus.map((sku) => {
      const { baseSku } = parseSkuId(sku.SkuID)
      const size = extractSize(sku.Size || '')
      return { ...sku, baseSku, size }
    })

    // Group by baseSku
    const grouped = new Map<string, typeof skusWithParsed>()
    for (const sku of skusWithParsed) {
      if (!grouped.has(sku.baseSku)) {
        grouped.set(sku.baseSku, [])
      }
      grouped.get(sku.baseSku)!.push(sku)
    }

    // Sort each group by size, then flatten with position flags
    const skus: Array<
      (typeof skusWithParsed)[0] & { isFirstInGroup: boolean; isLastInGroup: boolean }
    > = []
    const sortedBaseSkus = Array.from(grouped.keys()).sort()

    for (const baseSku of sortedBaseSkus) {
      const group = grouped.get(baseSku)!
      const sortedGroup = sortBySize(group)
      sortedGroup.forEach((sku, idx) => {
        skus.push({
          ...sku,
          isFirstInGroup: idx === 0,
          isLastInGroup: idx === sortedGroup.length - 1,
        })
      })
    }

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
    const totalStyles = sortedBaseSkus.length
    const totalSkus = skus.length
    const totalQuantity = skus.reduce((sum, s) => sum + (s.Quantity ?? 0), 0)

    // Generate HTML
    const html = generateProductsPdfHtml(skus, {
      totalStyles,
      totalSkus,
      totalQuantity,
      collectionName,
      tab,
      currency,
    })

    // Generate PDF
    const pdfBuffer = await generatePdf(html, {
      format: 'Letter',
      landscape: true,
    })

    // Return file with currency suffix in filename
    const currencySuffix = currency === 'BOTH' ? '' : `_${currency}`
    const filename = `Products_Report${currencySuffix}_${new Date().toISOString().split('T')[0]}.pdf`

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
  baseSku: string
  size: string
  Description: string | null
  OrderEntryDescription: string | null
  SkuColor: string | null
  FabricContent: string | null
  Quantity: number | null
  OnRoute: number | null
  PriceCAD: string | null
  PriceUSD: string | null
  ShowInPreOrder: boolean | null
  ShopifyImageURL: string | null
  ThumbnailPath: string | null
  Collection: { name: string } | null
  isFirstInGroup: boolean
  isLastInGroup: boolean
}

function generateProductsPdfHtml(
  skus: SkuForPdf[],
  summary: {
    totalStyles: number
    totalSkus: number
    totalQuantity: number
    collectionName: string | null
    tab: string
    currency: CurrencyMode
  }
): string {
  const now = new Date()

  // Group SKUs by baseSku for page-break control
  const groupedByBaseSku = new Map<string, typeof skus>()
  for (const sku of skus) {
    if (!groupedByBaseSku.has(sku.baseSku)) {
      groupedByBaseSku.set(sku.baseSku, [])
    }
    groupedByBaseSku.get(sku.baseSku)!.push(sku)
  }

  // Generate table body groups - each product group in its own tbody for page-break control
  const tableBodyGroups = Array.from(groupedByBaseSku.entries())
    .map(([, groupSkus]) => {
      const rows = groupSkus.map((sku) => {
        const description = sku.OrderEntryDescription ?? sku.Description ?? ''
        const color = resolveColor(sku.SkuColor, sku.SkuID, description)
        const priceCad = parsePrice(sku.PriceCAD)
        const priceUsd = parsePrice(sku.PriceUSD)
        const wholesalePrice = formatPrice(priceCad, priceUsd, summary.currency)

        // Use local thumbnail (120x120px) to keep PDF small, fall back to no image
        // ThumbnailPath is like "/thumbnails/abc123.png" - convert to file:// URL
        const thumbnailUrl = sku.ThumbnailPath
          ? `file://${process.cwd()}/public${sku.ThumbnailPath}`
          : null

        // Build row with firstRowOnly logic
        const imageCell = sku.isFirstInGroup && thumbnailUrl
          ? `<img src="${thumbnailUrl}" alt="${sku.baseSku}" class="product-img" />`
          : sku.isFirstInGroup
            ? `<div class="no-image">No Image</div>`
            : ''

        const rowClass = sku.isLastInGroup ? 'group-last' : ''

        return `
          <tr class="${rowClass}">
            <td class="image-cell">${imageCell}</td>
            <td>${sku.isFirstInGroup ? sku.baseSku : ''}</td>
            <td>${sku.SkuID}</td>
            <td class="desc-cell">${sku.isFirstInGroup ? description.substring(0, 35) + (description.length > 35 ? '...' : '') : ''}</td>
            <td>${sku.isFirstInGroup ? color : ''}</td>
            <td>${sku.isFirstInGroup ? (sku.FabricContent ?? '').substring(0, 20) : ''}</td>
            <td class="text-center">${sku.size || '—'}</td>
            <td class="text-right">${(sku.Quantity ?? 0).toLocaleString()}</td>
            <td>${sku.isFirstInGroup ? (sku.Collection?.name ?? '') : ''}</td>
            <td class="text-center">${sku.isFirstInGroup ? (sku.ShowInPreOrder ? 'Pre-Order' : 'ATS') : ''}</td>
            <td class="price-cell">${sku.isFirstInGroup ? wholesalePrice : ''}</td>
            <td class="text-center qty-col"></td>
          </tr>
        `
      }).join('')

      return `<tbody class="product-group">${rows}</tbody>`
    })
    .join('')

  const subtitle = summary.collectionName
    ? `Collection: ${summary.collectionName}`
    : summary.tab === 'ats'
      ? 'Available to Ship'
      : summary.tab === 'preorder'
        ? 'Pre-Order'
        : 'All Products'

  const currencyLabel = summary.currency === 'BOTH'
    ? 'CAD/USD'
    : summary.currency

  const content = `
    <style>
      .products-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8pt;
        margin-top: 16px;
      }

      .products-table thead {
        display: table-header-group;
      }

      .products-table th {
        background: #1E40AF;
        color: white;
        padding: 6px 4px;
        text-align: left;
        font-weight: 600;
        font-size: 7pt;
        border: 1px solid #1E40AF;
      }

      .products-table td {
        padding: 4px;
        border: 1px solid #e5e7eb;
        vertical-align: middle;
        font-size: 7pt;
      }

      .products-table tr.group-last td {
        border-bottom: 2px solid #6b7280;
      }

      .product-group {
        page-break-inside: avoid;
      }

      .image-cell {
        width: 60px;
        text-align: center;
        vertical-align: middle;
      }

      .product-img {
        max-width: 55px;
        max-height: 55px;
        object-fit: contain;
        border-radius: 2px;
      }

      .no-image {
        width: 55px;
        height: 55px;
        background: #f5f5f5;
        border: 1px solid #e5e5e5;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 6pt;
        color: #999;
        border-radius: 2px;
        margin: 0 auto;
      }

      .desc-cell {
        max-width: 120px;
      }

      .price-cell {
        font-size: 6pt;
        white-space: nowrap;
      }

      .text-right {
        text-align: right !important;
      }

      .text-center {
        text-align: center !important;
      }

      .qty-col {
        width: 50px;
        min-width: 50px;
      }
    </style>

    <div class="pdf-header">
      <div class="pdf-header-left">
        <div class="pdf-logo">OrderHub</div>
      </div>
      <div class="pdf-header-right">
        <div class="pdf-title">PRODUCTS REPORT</div>
        <div class="pdf-subtitle">${subtitle} • ${currencyLabel}</div>
        <div class="pdf-subtitle">Generated: ${formatDate(now)}</div>
      </div>
    </div>

    <div class="pdf-summary">
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.totalStyles.toLocaleString()}</div>
        <div class="pdf-summary-label">Styles</div>
      </div>
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.totalSkus.toLocaleString()}</div>
        <div class="pdf-summary-label">SKUs</div>
      </div>
      <div class="pdf-summary-card">
        <div class="pdf-summary-value">${summary.totalQuantity.toLocaleString()}</div>
        <div class="pdf-summary-label">Available</div>
      </div>
    </div>

    <table class="products-table">
      <thead>
        <tr>
          <th>Image</th>
          <th>Style</th>
          <th>SKU</th>
          <th>Description</th>
          <th>Color</th>
          <th>Material</th>
          <th class="text-center">Size</th>
          <th class="text-right">Available</th>
          <th>Collection</th>
          <th class="text-center">Status</th>
          <th>Wholesale</th>
          <th class="text-center qty-col">Qty</th>
        </tr>
      </thead>
      ${tableBodyGroups}
    </table>

    <div class="pdf-footer">
      <span>Exported from OrderHub on ${formatDate(now)}</span>
    </div>
  `

  return wrapHtml(content, 'Products Report - OrderHub')
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
