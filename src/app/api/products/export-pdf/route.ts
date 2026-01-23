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
import { parsePrice, getBaseSku, resolveColor } from '@/lib/utils'
import { extractSize, sortBySize, loadSizeOrderConfig } from '@/lib/utils/size-sort'
import { getImageDataUrl } from '@/lib/utils/pdf-images'
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
 * Parse orientation from query param
 */
function parseOrientation(value: string | undefined): 'landscape' | 'portrait' {
  if (value === 'portrait') {
    return 'portrait'
  }
  return 'landscape' // Default
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
    // Auth check - allow both admin and rep roles
    const session = await auth()
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'rep')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries())
    const q = getString(searchParams.q)
    const currency = parseCurrencyMode(getString(searchParams.currency))
    const orientation = parseOrientation(getString(searchParams.orientation))

    // Parse collections param: 'all' | 'ats' | 'preorder' | '1,2,3'
    const collectionsRaw = getString(searchParams.collections) ?? 'all'

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

    // Collections filter
    if (collectionsRaw === 'ats') {
      // Filter to products from ATS-type collections
      where.Collection = { type: 'ATS' }
    } else if (collectionsRaw === 'preorder') {
      // Filter to products from PreOrder-type collections
      where.Collection = { type: 'PreOrder' }
    } else if (collectionsRaw !== 'all' && collectionsRaw !== 'specific') {
      // Parse as comma-separated collection IDs
      const ids = collectionsRaw.split(',').map(Number).filter(Number.isFinite)
      if (ids.length > 0) {
        where.CollectionID = { in: ids }
      }
    }

    // PDF always filters out 0-availability SKUs
    where.Quantity = { gte: 1 }

    // Fetch SKUs with all required fields including collection name
    const rawSkus = await prisma.sku.findMany({
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
        UnitsPerSku: true,
        UnitPriceCAD: true,
        UnitPriceUSD: true,
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
      const baseSku = getBaseSku(sku.SkuID, sku.Size)
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

    // Load size order config from DB before sorting
    await loadSizeOrderConfig()

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

    // Get collection name if filtering by specific collections
    let collectionName: string | null = null
    if (collectionsRaw !== 'all' && collectionsRaw !== 'ats' && collectionsRaw !== 'preorder' && collectionsRaw !== 'specific') {
      const ids = collectionsRaw.split(',').map(Number).filter(Number.isFinite)
      if (ids.length === 1) {
        // Single collection - get its name
        const collection = await prisma.collection.findUnique({
          where: { id: ids[0] },
          select: { name: true },
        })
        collectionName = collection?.name ?? null
      } else if (ids.length > 1) {
        // Multiple collections
        collectionName = `${ids.length} Collections`
      }
    }

    // Calculate summary stats
    const totalStyles = sortedBaseSkus.length
    const totalSkus = skus.length
    const totalQuantity = skus.reduce((sum, s) => sum + (s.Quantity ?? 0), 0)

    // Pre-fetch all images for first rows of each group (parallel fetch)
    const firstRowSkus = skus.filter(s => s.isFirstInGroup)
    const imageDataUrls = await Promise.all(
      firstRowSkus.map(async (sku) => {
        const dataUrl = await getImageDataUrl(sku.ThumbnailPath, sku.ShopifyImageURL)
        return { baseSku: sku.baseSku, dataUrl }
      })
    )
    const imageMap = new Map(imageDataUrls.map(i => [i.baseSku, i.dataUrl]))

    // Generate HTML
    const html = generateProductsPdfHtml(skus, imageMap, {
      totalStyles,
      totalSkus,
      totalQuantity,
      collectionName,
      collectionsMode: collectionsRaw,
      currency,
      orientation,
    })

    // Generate PDF
    const pdfBuffer = await generatePdf(html, {
      format: 'Letter',
      landscape: orientation === 'landscape',
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
  UnitsPerSku: number | null
  UnitPriceCAD: unknown // Decimal from Prisma
  UnitPriceUSD: unknown // Decimal from Prisma
  ShowInPreOrder: boolean | null
  ShopifyImageURL: string | null
  ThumbnailPath: string | null
  Collection: { name: string } | null
  isFirstInGroup: boolean
  isLastInGroup: boolean
}

function generateProductsPdfHtml(
  skus: SkuForPdf[],
  imageMap: Map<string, string | null>,
  summary: {
    totalStyles: number
    totalSkus: number
    totalQuantity: number
    collectionName: string | null
    collectionsMode: string
    currency: CurrencyMode
    orientation: 'landscape' | 'portrait'
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

  const isPortrait = summary.orientation === 'portrait'

  // Generate table body groups - each product group in its own tbody for page-break control
  const tableBodyGroups = Array.from(groupedByBaseSku.entries())
    .map(([, groupSkus]) => {
      const rows = groupSkus.map((sku) => {
        const description = sku.OrderEntryDescription ?? sku.Description ?? ''
        const color = resolveColor(sku.SkuColor, sku.SkuID, description)
        const material = sku.FabricContent ?? ''
        const priceCad = parsePrice(sku.PriceCAD)
        const priceUsd = parsePrice(sku.PriceUSD)
        const packPrice = formatPrice(priceCad, priceUsd, summary.currency)

        // Unit price calculation
        const unitPriceCad = sku.UnitPriceCAD ? Number(sku.UnitPriceCAD) : priceCad
        const unitPriceUsd = sku.UnitPriceUSD ? Number(sku.UnitPriceUSD) : priceUsd
        const unitPrice = formatPrice(unitPriceCad, unitPriceUsd, summary.currency)

        // Units per SKU
        const unitsPerSku = sku.UnitsPerSku ?? 1

        // Get pre-fetched image data URL from map
        const imageUrl = imageMap.get(sku.baseSku)

        // Build row with firstRowOnly logic
        const imageCell = sku.isFirstInGroup && imageUrl
          ? `<img src="${imageUrl}" alt="${sku.baseSku}" class="product-img" />`
          : ''

        const rowClass = sku.isLastInGroup ? 'group-last' : ''

        if (isPortrait) {
          // Portrait layout: consolidated Product column with units info
          // First row: Style (bold), Color • Material, Description
          // Other rows: empty product cell
          const unitsLabel = unitsPerSku > 1 ? ` (${unitsPerSku}pc)` : ''
          const productCell = sku.isFirstInGroup
            ? `<div class="product-style">${sku.baseSku}${unitsLabel}</div>
               <div class="product-details">${color}${color && material ? ' • ' : ''}${material.substring(0, 25)}</div>
               <div class="product-details">${description.substring(0, 40)}${description.length > 40 ? '...' : ''}</div>`
            : ''

          return `
            <tr class="${rowClass}">
              <td class="image-cell">${imageCell}</td>
              <td class="product-cell">${productCell}</td>
              <td class="text-center">${sku.size || '—'}</td>
              <td class="text-right">${(sku.Quantity ?? 0).toLocaleString()}</td>
              <td class="price-cell">${sku.isFirstInGroup ? packPrice : ''}</td>
              <td class="price-cell">${sku.isFirstInGroup ? unitPrice : ''}</td>
              <td class="text-center qty-col-portrait"></td>
            </tr>
          `
        } else {
          // Landscape layout: separate columns
          return `
            <tr class="${rowClass}">
              <td class="image-cell">${imageCell}</td>
              <td>${sku.isFirstInGroup ? sku.baseSku : ''}</td>
              <td>${sku.SkuID}</td>
              <td class="desc-cell">${sku.isFirstInGroup ? description.substring(0, 35) + (description.length > 35 ? '...' : '') : ''}</td>
              <td>${sku.isFirstInGroup ? color : ''}</td>
              <td class="text-center">${sku.size || '—'}</td>
              <td class="text-right">${(sku.Quantity ?? 0).toLocaleString()}</td>
              <td class="text-center">${sku.isFirstInGroup ? (sku.ShowInPreOrder ? 'Pre-Order' : 'ATS') : ''}</td>
              <td class="text-center">${sku.isFirstInGroup ? unitsPerSku : ''}</td>
              <td class="price-cell">${sku.isFirstInGroup ? packPrice : ''}</td>
              <td class="price-cell">${sku.isFirstInGroup ? unitPrice : ''}</td>
              <td class="text-center qty-col"></td>
            </tr>
          `
        }
      }).join('')

      return `<tbody class="product-group">${rows}</tbody>`
    })
    .join('')

  const subtitle = summary.collectionName
    ? `Collection: ${summary.collectionName}`
    : summary.collectionsMode === 'ats'
      ? 'ATS Collections'
      : summary.collectionsMode === 'preorder'
        ? 'Pre-Order Collections'
        : 'All Products'

  const currencyLabel = summary.currency === 'BOTH'
    ? 'CAD/USD'
    : summary.currency

  // Table header based on orientation
  const tableHeader = isPortrait
    ? `<tr>
          <th>Image</th>
          <th>Product</th>
          <th class="text-center">Size</th>
          <th class="text-right">Avail</th>
          <th>Pack Price</th>
          <th>Unit Price</th>
          <th class="text-center qty-col-portrait">Order Qty</th>
        </tr>`
    : `<tr>
          <th>Image</th>
          <th>Style</th>
          <th>SKU</th>
          <th>Description</th>
          <th>Color</th>
          <th class="text-center">Size</th>
          <th class="text-right">Avail</th>
          <th class="text-center">Status</th>
          <th class="text-center">Units</th>
          <th>Pack Price</th>
          <th>Unit Price</th>
          <th class="text-center qty-col">Qty</th>
        </tr>`

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
        padding: 8px 6px;
        text-align: left;
        font-weight: 600;
        font-size: 7.5pt;
        border: 1px solid #1E40AF;
      }

      .products-table td {
        padding: 6px;
        border: 1px solid #e5e7eb;
        vertical-align: middle;
        font-size: 7.5pt;
      }

      .products-table tr.group-last td {
        border-bottom: 2px solid #4b5563;
      }

      .products-table tr:first-child td {
        background: #fafafa;
      }

      .product-group {
        page-break-inside: avoid;
      }

      .image-cell {
        width: 70px;
        text-align: center;
        vertical-align: top;
        padding: 6px !important;
      }

      .product-img {
        max-width: 60px;
        max-height: 60px;
        object-fit: contain;
        border-radius: 3px;
        border: 1px solid #e5e7eb;
      }

      .desc-cell {
        max-width: 140px;
      }

      .price-cell {
        font-size: 6.5pt;
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

      /* Portrait-specific styles */
      .qty-col-portrait {
        width: 100px;
        min-width: 100px;
      }

      .product-cell {
        vertical-align: top;
        padding: 8px !important;
      }

      .product-style {
        font-weight: 600;
        font-size: 9pt;
        margin-bottom: 2px;
      }

      .product-details {
        font-size: 7pt;
        color: #6b7280;
        line-height: 1.3;
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
        ${tableHeader}
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
