/**
 * PDF Export Generator
 *
 * Generates PDF reports from product data using Puppeteer with:
 * - SKUs grouped by Style (baseSku) with image on first row only
 * - Currency toggle (USD / CAD / Both)
 * - Portrait and landscape orientations
 * - Thick border separators between groups
 * - Role-based thumbnail fallback policy
 * - Collection name fetch with error handling
 *
 * Extracted from api/products/export-pdf/route.ts for use in background jobs.
 *
 * Phase 3: Durable Background Jobs
 */

import { prisma } from '@/lib/prisma'
import { generatePdf, wrapHtml, formatDate } from '@/lib/pdf/generate'
import { parsePrice, getBaseSku, resolveColor } from '@/lib/utils'
import { sortBySize, loadSizeOrderConfig, loadSizeAliasConfig } from '@/lib/utils/size-sort'
import { getImageDataUrlByPolicyWithStats } from '@/lib/utils/pdf-images'
import { type ExportPolicy } from '@/lib/data/queries/export-policy'
import { getAvailabilitySettings, getIncomingMapForSkus } from '@/lib/data/queries/availability-settings'
import { computeAvailabilityDisplay, getAvailabilityScenario } from '@/lib/availability/compute'
import type { CurrencyMode } from '@/lib/types/export'
import type { AvailabilitySettingsRecord } from '@/lib/types/availability-settings'

// ============================================================================
// Helper Functions
// ============================================================================

interface ScenariosPresent {
  hasAts: boolean
  hasPreorderIncoming: boolean
  hasPreorderNoIncoming: boolean
}

function shouldShowLegend(
  scenarios: ScenariosPresent,
  settings: Pick<AvailabilitySettingsRecord, 'showLegendAts' | 'showLegendPreorderIncoming' | 'showLegendPreorderNoIncoming'>
): boolean {
  return (
    (scenarios.hasAts && settings.showLegendAts) ||
    (scenarios.hasPreorderIncoming && settings.showLegendPreorderIncoming) ||
    (scenarios.hasPreorderNoIncoming && settings.showLegendPreorderNoIncoming)
  )
}

// ============================================================================
// Types
// ============================================================================

export interface PdfExportFilters {
  collections?: string // 'all' | 'ats' | 'preorder' | '1,2,3'
  currency?: string // 'CAD' | 'USD' | 'BOTH'
  q?: string // Search query
  orientation?: string // 'portrait' | 'landscape'
}

export interface PdfExportMetrics {
  totalSkus: number
  totalStyles: number
  imagesProcessed: number
  s3Hits: number
  shopifyFallbacks: number
  failures: number
  durationMs: number
}

export type ProgressCallback = (
  step: string,
  detail: string,
  percent: number,
  metrics?: Partial<PdfExportMetrics>
) => Promise<void>

export interface PdfExportResult {
  buffer: Buffer
  filename: string
  metrics: PdfExportMetrics
}

// ============================================================================
// Helpers
// ============================================================================

function parseCurrencyMode(value: string | undefined): CurrencyMode {
  if (value === 'USD' || value === 'CAD' || value === 'BOTH') {
    return value
  }
  return 'BOTH'
}

function parseOrientation(value: string | undefined): 'landscape' | 'portrait' {
  if (value === 'portrait') {
    return 'portrait'
  }
  return 'landscape'
}

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

function resolveAvailableLabel(
  settings: AvailabilitySettingsRecord,
  collectionsRaw: string,
  collectionTypes: Array<string | null | undefined>
): string {
  if (collectionsRaw === 'preorder') {
    return settings.matrix.preorder_incoming.pdf.label
  }
  if (collectionsRaw === 'ats') {
    return settings.matrix.ats.pdf.label
  }
  const types = collectionTypes.filter(Boolean) as string[]
  const unique = new Set(types)
  if (unique.size === 1) {
    const onlyType = Array.from(unique)[0]
    if (onlyType === 'preorder_no_po' || onlyType === 'preorder_po') {
      return settings.matrix.preorder_incoming.pdf.label
    }
    if (onlyType === 'ats') {
      return settings.matrix.ats.pdf.label
    }
  }
  return settings.matrix.ats.pdf.label
}

/**
 * Check if a job has been cancelled
 */
async function checkCancelled(jobId: string | undefined): Promise<boolean> {
  if (!jobId) return false
  const job = await prisma.exportJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  })
  return job?.status === 'cancelled'
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate PDF export buffer with progress tracking.
 *
 * @param filters - Collection, currency, search, and orientation filters
 * @param policy - Export policy from DB (thumbnail size, fallback settings)
 * @param userRole - 'admin' or 'rep' - affects thumbnail fallback behavior
 * @param onProgress - Callback for progress updates (for job tracking)
 * @param jobId - Optional job ID for cancellation checking (not used in sync mode)
 */
export async function generatePdfExport(
  filters: PdfExportFilters,
  policy: ExportPolicy,
  userRole: 'admin' | 'rep',
  onProgress: ProgressCallback,
  jobId?: string
): Promise<PdfExportResult> {
  const startTime = Date.now()

  const metrics: PdfExportMetrics = {
    totalSkus: 0,
    totalStyles: 0,
    imagesProcessed: 0,
    s3Hits: 0,
    shopifyFallbacks: 0,
    failures: 0,
    durationMs: 0,
  }

  // -------------------------------------------------------------------------
  // Step 1: Build where clause
  // -------------------------------------------------------------------------
  await onProgress('querying', 'Building query filters', 5)

  const collectionsRaw = filters.collections ?? 'all'
  const currency = parseCurrencyMode(filters.currency)
  const orientation = parseOrientation(filters.orientation)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (filters.q) {
    where.OR = [
      { SkuID: { contains: filters.q } },
      { Description: { contains: filters.q } },
      { OrderEntryDescription: { contains: filters.q } },
    ]
  }

  // Collections filter
  if (collectionsRaw === 'ats') {
    where.Collection = { type: 'ats' }
    // For ATS exports, only include SKUs with available quantity
    where.Quantity = { gte: 1 }
  } else if (collectionsRaw === 'preorder') {
    where.Collection = { type: { in: ['preorder_no_po', 'preorder_po'] } }
  } else if (collectionsRaw !== 'all' && collectionsRaw !== 'specific') {
    const ids = collectionsRaw.split(',').map(Number).filter(Number.isFinite)
    if (ids.length > 0) {
      where.CollectionID = { in: ids }
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Fetch SKUs
  // -------------------------------------------------------------------------
  await onProgress('querying', 'Fetching product data from database', 10)

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
      Collection: { select: { name: true, type: true } },
    },
  })

  const availabilitySettings = await getAvailabilitySettings()
  const incomingMap = await getIncomingMapForSkus(rawSkus.map((sku) => sku.SkuID))
  const showOnRoute = availabilitySettings.showOnRoutePdf
  const onRouteLabel = availabilitySettings.onRouteLabelPdf
  const availableLabel = resolveAvailableLabel(
    availabilitySettings,
    collectionsRaw,
    rawSkus.map((sku) => sku.Collection?.type)
  )

  // -------------------------------------------------------------------------
  // Step 3: Group and sort SKUs
  // -------------------------------------------------------------------------
  await onProgress('querying', 'Grouping and sorting products', 15)

  // Track which scenarios are present for legend display
  const scenariosPresent = {
    hasAts: false,
    hasPreorderIncoming: false,
    hasPreorderNoIncoming: false,
  }

  const skusWithParsed = rawSkus.map((sku) => {
    const baseSku = getBaseSku(sku.SkuID, sku.Size)
    const size = sku.Size || ''
    const incomingEntry = incomingMap.get(sku.SkuID)
    const incoming = incomingEntry?.incoming ?? null
    const committed = incomingEntry?.committed ?? null
    const scenario = getAvailabilityScenario(sku.Collection?.type ?? null)

    // Track scenario for legend display
    if (scenario === 'ats') scenariosPresent.hasAts = true
    else if (scenario === 'preorder_incoming') scenariosPresent.hasPreorderIncoming = true
    else if (scenario === 'preorder_no_incoming') scenariosPresent.hasPreorderNoIncoming = true

    const displayResult = computeAvailabilityDisplay(
      scenario,
      'pdf',
      {
        quantity: sku.Quantity ?? 0,
        onRoute: sku.OnRoute ?? 0,
        incoming,
        committed,
      },
      availabilitySettings
    )

    return {
      ...sku,
      baseSku,
      size,
      availableDisplay: displayResult.display,
      availableNumeric: displayResult.numericValue,
    }
  })

  const grouped = new Map<string, typeof skusWithParsed>()
  for (const sku of skusWithParsed) {
    if (!grouped.has(sku.baseSku)) {
      grouped.set(sku.baseSku, [])
    }
    grouped.get(sku.baseSku)!.push(sku)
  }

  await Promise.all([loadSizeOrderConfig(), loadSizeAliasConfig()])

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

  metrics.totalSkus = skus.length
  metrics.totalStyles = sortedBaseSkus.length

  // -------------------------------------------------------------------------
  // Step 4: Fetch collection name (with error handling)
  // -------------------------------------------------------------------------
  let collectionName: string | null = null
  if (
    collectionsRaw !== 'all' &&
    collectionsRaw !== 'ats' &&
    collectionsRaw !== 'preorder' &&
    collectionsRaw !== 'specific'
  ) {
    const ids = collectionsRaw.split(',').map(Number).filter(Number.isFinite)
    if (ids.length === 1) {
      try {
        const collection = await prisma.collection.findUnique({
          where: { id: ids[0] },
          select: { name: true },
        })
        collectionName = collection?.name ?? null
      } catch (err) {
        // Log error but don't fail the export - use fallback name
        console.error(`[PDFGenerator] Failed to fetch collection ${ids[0]}:`, err)
        collectionName = `Collection ${ids[0]}`
      }
    } else if (ids.length > 1) {
      collectionName = `${ids.length} Collections`
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Fetch images (parallel with role-based policy)
  // -------------------------------------------------------------------------
  await onProgress(
    'fetching_images',
    `Fetching images for ${sortedBaseSkus.length} styles`,
    20
  )

  const firstRowSkus = skus.filter((s) => s.isFirstInGroup)
  const totalImages = firstRowSkus.length

  // Role-based policy: reps always get Shopify fallback
  const imagePolicy = {
    thumbnailSize: policy.thumbnailSize,
    requireS3: policy.requireS3,
    allowShopifyFallback: userRole === 'rep' ? true : policy.allowShopifyFallback,
  }

  const imageDataUrls = await Promise.all(
    firstRowSkus.map(async (sku, index) => {
      const result = await getImageDataUrlByPolicyWithStats(
        sku.ThumbnailPath,
        sku.ShopifyImageURL,
        imagePolicy
      )

      // Track metrics
      metrics.imagesProcessed++
      if (result.source === 's3') metrics.s3Hits++
      else if (result.source === 'shopify') metrics.shopifyFallbacks++
      else metrics.failures++

      // Update progress every 10 images
      if ((index + 1) % 10 === 0 || index + 1 === totalImages) {
        const percent = 20 + Math.round(((index + 1) / totalImages) * 50)
        await onProgress(
          'fetching_images',
          `Fetched ${index + 1}/${totalImages} images`,
          percent,
          metrics
        )

        // Check for cancellation every 10 images to allow early exit
        if (await checkCancelled(jobId)) {
          throw new Error('Export cancelled by user')
        }
      }

      return { baseSku: sku.baseSku, dataUrl: result.dataUrl }
    })
  )

  const imageMap = new Map(imageDataUrls.map((i) => [i.baseSku, i.dataUrl]))

  // -------------------------------------------------------------------------
  // Step 6: Generate HTML
  // -------------------------------------------------------------------------
  await onProgress('generating', 'Building PDF content', 75)

  const totalQuantity = skus.reduce((sum, s) => sum + (s.availableNumeric ?? 0), 0)

  const html = generateProductsPdfHtml(
    skus,
    imageMap,
    {
      totalStyles: sortedBaseSkus.length,
      totalSkus: skus.length,
      totalQuantity,
      collectionName,
      collectionsMode: collectionsRaw,
      currency,
      orientation,
    },
    {
      availableLabel,
      showOnRoute,
      onRouteLabel,
      legendText: shouldShowLegend(scenariosPresent, availabilitySettings)
        ? availabilitySettings.legendText
        : undefined,
    }
  )

  // -------------------------------------------------------------------------
  // Step 7: Render PDF
  // -------------------------------------------------------------------------
  await onProgress('generating', 'Rendering PDF', 85)

  const pdfBytes = await generatePdf(html, {
    format: 'Letter',
    landscape: orientation === 'landscape',
  })
  const pdfBuffer = Buffer.from(pdfBytes)

  metrics.durationMs = Date.now() - startTime

  // Generate filename
  const currencySuffix = currency === 'BOTH' ? '' : `_${currency}`
  const filename = `Products_Report${currencySuffix}_${new Date().toISOString().split('T')[0]}.pdf`

  return {
    buffer: pdfBuffer,
    filename,
    metrics,
  }
}

// ============================================================================
// HTML Template (Extracted from route.ts)
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
  UnitPriceCAD: unknown
  UnitPriceUSD: unknown
  ShowInPreOrder: boolean | null
  ShopifyImageURL: string | null
  ThumbnailPath: string | null
  Collection: { name: string } | null
  availableDisplay: string
  availableNumeric: number | null
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
  },
  availability: {
    availableLabel: string
    showOnRoute: boolean
    onRouteLabel: string
    legendText?: string
  }
): string {
  const now = new Date()

  const groupedByBaseSku = new Map<string, typeof skus>()
  for (const sku of skus) {
    if (!groupedByBaseSku.has(sku.baseSku)) {
      groupedByBaseSku.set(sku.baseSku, [])
    }
    groupedByBaseSku.get(sku.baseSku)!.push(sku)
  }

  const isPortrait = summary.orientation === 'portrait'
  const availableLabel = availability.availableLabel
  const onRouteLabel = availability.onRouteLabel
  const showOnRoute = availability.showOnRoute

  const tableBodyGroups = Array.from(groupedByBaseSku.entries())
    .map(([, groupSkus]) => {
      const rows = groupSkus
        .map((sku) => {
          const description = sku.OrderEntryDescription ?? sku.Description ?? ''
          const color = resolveColor(sku.SkuColor, sku.SkuID, description)
          const material = sku.FabricContent ?? ''
          const priceCad = parsePrice(sku.PriceCAD)
          const priceUsd = parsePrice(sku.PriceUSD)
          const packPrice = formatPrice(priceCad, priceUsd, summary.currency)

          const unitPriceCad = sku.UnitPriceCAD ? Number(sku.UnitPriceCAD) : priceCad
          const unitPriceUsd = sku.UnitPriceUSD ? Number(sku.UnitPriceUSD) : priceUsd
          const unitPrice = formatPrice(unitPriceCad, unitPriceUsd, summary.currency)

          const unitsPerSku = sku.UnitsPerSku ?? 1
          const imageUrl = imageMap.get(sku.baseSku)

          const imageCell =
            sku.isFirstInGroup && imageUrl
              ? `<img src="${imageUrl}" alt="${sku.baseSku}" class="product-img" />`
              : ''

          const rowClass = sku.isLastInGroup ? 'group-last' : ''

          if (isPortrait) {
            const unitsLabel = unitsPerSku > 1 ? ` (${unitsPerSku}pc)` : ''
            const productCell = sku.isFirstInGroup
              ? `<div class="product-style">${sku.baseSku}${unitsLabel}</div>
                 <div class="product-details">${color}${color && material ? ' • ' : ''}${material.substring(0, 25)}</div>
                 <div class="product-details">${description.substring(0, 40)}${description.length > 40 ? '...' : ''}</div>`
              : ''

            const onRouteValue = (sku.OnRoute ?? 0).toLocaleString()
            return `
              <tr class="${rowClass}">
                <td class="image-cell">${imageCell}</td>
                <td class="product-cell">${productCell}</td>
                <td class="text-center">${sku.size || '—'}</td>
                <td class="text-right">${sku.availableDisplay}</td>
                ${showOnRoute ? `<td class="text-right">${onRouteValue}</td>` : ''}
                <td class="price-cell">${sku.isFirstInGroup ? packPrice : ''}</td>
                <td class="price-cell">${sku.isFirstInGroup ? unitPrice : ''}</td>
                <td class="text-center qty-col-portrait"></td>
              </tr>
            `
          } else {
            const onRouteValue = (sku.OnRoute ?? 0).toLocaleString()
            return `
              <tr class="${rowClass}">
                <td class="image-cell">${imageCell}</td>
                <td>${sku.isFirstInGroup ? sku.baseSku : ''}</td>
                <td>${sku.SkuID}</td>
                <td class="desc-cell">${sku.isFirstInGroup ? description.substring(0, 35) + (description.length > 35 ? '...' : '') : ''}</td>
                <td>${sku.isFirstInGroup ? color : ''}</td>
                <td class="text-center">${sku.size || '—'}</td>
                <td class="text-right">${sku.availableDisplay}</td>
                ${showOnRoute ? `<td class="text-right">${onRouteValue}</td>` : ''}
                <td class="text-center">${sku.isFirstInGroup ? (sku.ShowInPreOrder ? 'Pre-Order' : 'ATS') : ''}</td>
                <td class="text-center">${sku.isFirstInGroup ? unitsPerSku : ''}</td>
                <td class="price-cell">${sku.isFirstInGroup ? packPrice : ''}</td>
                <td class="price-cell">${sku.isFirstInGroup ? unitPrice : ''}</td>
                <td class="text-center qty-col"></td>
              </tr>
            `
          }
        })
        .join('')

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

  const currencyLabel = summary.currency === 'BOTH' ? 'CAD/USD' : summary.currency

  const tableHeader = isPortrait
    ? `<tr>
        <th>Image</th>
        <th>Product</th>
        <th class="text-center">Size</th>
        <th class="text-right">${availableLabel}</th>
        ${showOnRoute ? `<th class="text-right">${onRouteLabel}</th>` : ''}
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
        <th class="text-right">${availableLabel}</th>
        ${showOnRoute ? `<th class="text-right">${onRouteLabel}</th>` : ''}
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

      .pdf-legend {
        margin-top: 10px;
        font-size: 7pt;
        color: #6b7280;
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
        <div class="pdf-summary-label">${availableLabel}</div>
      </div>
    </div>

    <table class="products-table">
      <thead>
        ${tableHeader}
      </thead>
      ${tableBodyGroups}
    </table>

    ${availability.legendText ? `<div class="pdf-legend">${availability.legendText}</div>` : ''}

    <div class="pdf-footer">
      <span>Exported from OrderHub on ${formatDate(now)}</span>
    </div>
  `

  return wrapHtml(content, 'Products Report - OrderHub')
}
