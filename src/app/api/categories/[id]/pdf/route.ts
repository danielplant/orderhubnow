/**
 * Category Line Sheet PDF API
 *
 * Generates a PDF line sheet for a specific category with product images.
 * Design: Generic "MyOrderHub" branding, grayscale, US Letter portrait.
 *
 * Access Points:
 * - Categories page: Per-row "Download Line Sheet" button
 * - Products page: "Export Category PDF" in export dropdown
 * - Direct API: GET /api/categories/[id]/pdf
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { generatePdf, wrapHtml, formatDate } from '@/lib/pdf/generate'
import { getEffectiveQuantity, parsePrice, parseSkuId, resolveColor } from '@/lib/utils'
import { extractSize } from '@/lib/utils/size-sort'

// ============================================================================
// Types
// ============================================================================

interface ProductForLineSheet {
  baseSku: string
  description: string
  priceCAD: number
  priceUSD: number
  color: string
  sizes: Array<{
    size: string
    quantity: number
    effectiveQty: number
    onRoute: number
  }>
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const categoryId = parseInt(id, 10)

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 })
    }

    // Get category info
    const category = await prisma.skuCategories.findUnique({
      where: { ID: categoryId },
      select: { ID: true, Name: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Fetch SKUs for this category
    const skus = await prisma.sku.findMany({
      where: { CategoryID: categoryId },
      orderBy: [{ SkuID: 'asc' }],
      select: {
        SkuID: true,
        Description: true,
        OrderEntryDescription: true,
        SkuColor: true,
        Quantity: true,
        OnRoute: true,
        PriceCAD: true,
        PriceUSD: true,
        Size: true,
      },
    })

    // Group by base SKU
    const productMap = new Map<string, ProductForLineSheet>()

    for (const sku of skus) {
      const { baseSku } = parseSkuId(sku.SkuID)
      const size = extractSize(sku.Size || '')
      const qty = sku.Quantity ?? 0
      const effectiveQty = getEffectiveQuantity(sku.SkuID, qty)

      if (!productMap.has(baseSku)) {
        const description = sku.OrderEntryDescription ?? sku.Description ?? ''
        productMap.set(baseSku, {
          baseSku,
          description,
          priceCAD: parsePrice(sku.PriceCAD),
          priceUSD: parsePrice(sku.PriceUSD),
          color: resolveColor(sku.SkuColor, sku.SkuID, description),
          sizes: [],
        })
      }

      const product = productMap.get(baseSku)!
      product.sizes.push({
        size: size || '—',
        quantity: qty,
        effectiveQty,
        onRoute: sku.OnRoute ?? 0,
      })
    }

    const products = Array.from(productMap.values())

    // Generate HTML
    const html = generateLineSheetHtml(products, category.Name)

    // Generate PDF (portrait for line sheet)
    const pdfBuffer = await generatePdf(html, {
      format: 'Letter',
      landscape: false,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
    })

    // Create safe filename
    const safeCategoryName = category.Name.replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `LineSheet_${safeCategoryName}_${new Date().toISOString().split('T')[0]}.pdf`

    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Category Line Sheet PDF error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}

// ============================================================================
// HTML Template
// ============================================================================

function generateLineSheetHtml(
  products: ProductForLineSheet[],
  categoryName: string
): string {
  const now = new Date()

  const productItems = products
    .map((product) => {
      // Sort sizes (numeric first, then alpha)
      const sortedSizes = [...product.sizes].sort((a, b) => {
        const aNum = parseFloat(a.size)
        const bNum = parseFloat(b.size)
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
        return a.size.localeCompare(b.size)
      })

      const sizeHeaders = sortedSizes.map((s) => `<th>${s.size}</th>`).join('')
      const atsRow = sortedSizes
        .map((s) => `<td>${s.effectiveQty > 0 ? s.effectiveQty : '—'}</td>`)
        .join('')
      const onRouteRow = sortedSizes
        .map((s) => `<td>${s.onRoute > 0 ? s.onRoute : '—'}</td>`)
        .join('')

      return `
        <div class="line-sheet-item">
          <div class="line-sheet-image">
            <span style="color: #999; font-size: 9pt;">No Image</span>
          </div>
          <div class="line-sheet-details">
            <div class="line-sheet-sku">${product.baseSku}</div>
            <div class="line-sheet-description">${product.description}</div>
            <div class="line-sheet-price">
              $${product.priceUSD.toFixed(2)} USD / $${product.priceCAD.toFixed(2)} CAD
            </div>
            <div class="line-sheet-sizes">
              <table>
                <thead>
                  <tr>
                    <th class="label">Size</th>
                    ${sizeHeaders}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="label">ATS</td>
                    ${atsRow}
                  </tr>
                  <tr>
                    <td class="label">On Route</td>
                    ${onRouteRow}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `
    })
    .join('')

  const content = `
    <div class="pdf-header">
      <div class="pdf-header-left">
        <div class="pdf-logo">MyOrderHub</div>
      </div>
      <div class="pdf-header-right">
        <div class="pdf-title">CATEGORY: ${categoryName}</div>
        <div class="pdf-subtitle">Generated: ${formatDate(now)}</div>
      </div>
    </div>

    ${productItems}

    <div class="pdf-footer">
      <span>Page 1</span>
      <span>Confidential</span>
    </div>
  `

  return wrapHtml(content, `Line Sheet - ${categoryName}`)
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
