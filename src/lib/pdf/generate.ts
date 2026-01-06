/**
 * PDF Generation using Puppeteer + Chromium
 *
 * Uses @sparticuz/chromium for serverless-optimized Chromium binary
 * and puppeteer-core for PDF generation.
 */

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

// ============================================================================
// Types
// ============================================================================

export interface PdfOptions {
  format?: 'Letter' | 'A4'
  landscape?: boolean
  margin?: {
    top?: string
    right?: string
    bottom?: string
    left?: string
  }
  printBackground?: boolean
  displayHeaderFooter?: boolean
  headerTemplate?: string
  footerTemplate?: string
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: PdfOptions = {
  format: 'Letter',
  landscape: true,
  printBackground: true,
  margin: {
    top: '0.5in',
    right: '0.5in',
    bottom: '0.75in',
    left: '0.5in',
  },
}

// ============================================================================
// PDF Generation
// ============================================================================

/**
 * Generate a PDF from HTML content.
 */
export async function generatePdf(
  html: string,
  options: PdfOptions = {}
): Promise<Uint8Array> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

  // Get Chromium executable path
  const execPath = await chromium.executablePath()
  console.log('Chromium executable path:', execPath)

  if (!execPath) {
    throw new Error('Chromium executable not found')
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: execPath,
    headless: true,
  })

  console.log('Browser launched successfully')

  try {
    const page = await browser.newPage()
    console.log('New page created')

    // Set content with wait for network idle
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    })

    console.log('Content set, generating PDF...')

    // Generate PDF
    const pdf = await page.pdf({
      format: mergedOptions.format,
      landscape: mergedOptions.landscape,
      printBackground: mergedOptions.printBackground,
      margin: mergedOptions.margin,
      displayHeaderFooter: mergedOptions.displayHeaderFooter,
      headerTemplate: mergedOptions.headerTemplate,
      footerTemplate: mergedOptions.footerTemplate,
    })

    console.log('PDF generated, size:', pdf.length, 'bytes')

    return pdf
  } finally {
    await browser.close()
    console.log('Browser closed')
  }
}

// ============================================================================
// HTML Templates
// ============================================================================

/**
 * Base HTML template with styles.
 */
export function wrapHtml(content: string, title: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #1a1a1a;
      background: white;
    }

    /* Header */
    .pdf-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #e5e5e5;
    }

    .pdf-header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .pdf-logo {
      font-size: 18pt;
      font-weight: 700;
      color: #171717;
    }

    .pdf-header-right {
      text-align: right;
    }

    .pdf-title {
      font-size: 16pt;
      font-weight: 600;
      color: #171717;
      margin-bottom: 4px;
    }

    .pdf-subtitle {
      font-size: 9pt;
      color: #666;
    }

    /* Summary Cards */
    .pdf-summary {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
    }

    .pdf-summary-card {
      flex: 1;
      padding: 12px 16px;
      background: #f5f5f5;
      border-radius: 6px;
    }

    .pdf-summary-value {
      font-size: 18pt;
      font-weight: 600;
      color: #171717;
    }

    .pdf-summary-label {
      font-size: 8pt;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Table */
    .pdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }

    .pdf-table th {
      background: #f5f5f5;
      font-weight: 600;
      text-align: left;
      padding: 8px 10px;
      border-bottom: 2px solid #e5e5e5;
    }

    .pdf-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e5e5e5;
      vertical-align: top;
    }

    .pdf-table tr:last-child td {
      border-bottom: none;
    }

    .pdf-table .text-right {
      text-align: right;
    }

    .pdf-table .text-center {
      text-align: center;
    }

    .pdf-table .text-muted {
      color: #666;
    }

    .pdf-table .font-medium {
      font-weight: 500;
    }

    /* Status badges */
    .pdf-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 500;
    }

    .pdf-status-pending { background: #fef3c7; color: #92400e; }
    .pdf-status-processing { background: #dbeafe; color: #1e40af; }
    .pdf-status-shipped { background: #d1fae5; color: #065f46; }
    .pdf-status-invoiced { background: #f3e8ff; color: #6b21a8; }
    .pdf-status-cancelled { background: #fee2e2; color: #991b1b; }

    /* Footer */
    .pdf-footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e5e5e5;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #666;
    }

    /* Line Sheet specific */
    .line-sheet-item {
      display: flex;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid #e5e5e5;
      page-break-inside: avoid;
    }

    .line-sheet-image {
      width: 125px;
      height: 125px;
      background: #f5f5f5;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .line-sheet-image img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .line-sheet-details {
      flex: 1;
    }

    .line-sheet-sku {
      font-weight: 600;
      font-size: 11pt;
      margin-bottom: 4px;
    }

    .line-sheet-description {
      color: #666;
      margin-bottom: 8px;
    }

    .line-sheet-price {
      font-weight: 500;
      margin-bottom: 12px;
    }

    .line-sheet-sizes {
      display: flex;
      gap: 0;
    }

    .line-sheet-sizes table {
      border-collapse: collapse;
      font-size: 8pt;
    }

    .line-sheet-sizes th,
    .line-sheet-sizes td {
      padding: 4px 8px;
      border: 1px solid #e5e5e5;
      text-align: center;
      min-width: 40px;
    }

    .line-sheet-sizes th {
      background: #f5f5f5;
      font-weight: 500;
    }

    .line-sheet-sizes .label {
      text-align: left;
      font-weight: 500;
    }

    /* Page breaks */
    .page-break {
      page-break-after: always;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>
`
}

/**
 * Format a date for display.
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format currency for display.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
