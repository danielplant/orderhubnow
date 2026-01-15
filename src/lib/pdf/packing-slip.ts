/**
 * Packing Slip PDF Template
 *
 * Warehouse-focused document for order fulfillment:
 * - NO PRICES (warehouse document)
 * - Prominent ship-to address
 * - Barcode for scanning
 * - Checkbox column for picking verification
 * - Signature area for packer
 */

import { wrapHtml } from './generate'

// ============================================================================
// Types
// ============================================================================

interface Address {
  name: string
  street1: string
  street2?: string
  city: string
  stateProvince: string
  zipPostal: string
  country: string
}

interface PackingSlipItem {
  sku: string
  productName: string
  size?: string
  color?: string
  quantity: number
}

interface PackingSlipData {
  // Order info
  orderNumber: string
  orderDate: Date
  shipWindowStart: Date
  shipWindowEnd: Date
  customerPO?: string
  
  // Shipment info
  shipmentNumber: number
  totalShipments: number
  shipDate: Date
  carrier?: string
  trackingNumber?: string
  
  // Addresses
  shipTo: Address
  
  // Items
  items: PackingSlipItem[]
  
  // Totals
  totalItems: number
  totalUnits: number
}

// ============================================================================
// Formatters
// ============================================================================

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShipWindow(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Simple Code128 barcode generator (subset B for alphanumeric)
// Reserved for future use when barcode printing is enabled
function _generateBarcodeDataUrl(text: string): string {
  // For simplicity, we'll use a text-based representation
  // In production, you might use a library like JsBarcode
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="60">
      <rect width="200" height="40" fill="white"/>
      <text x="100" y="55" text-anchor="middle" font-family="monospace" font-size="12">${text}</text>
      <!-- Simplified barcode representation -->
      ${Array.from(text).map((char, i) => {
        const code = char.charCodeAt(0)
        const bars = []
        for (let j = 0; j < 8; j++) {
          if ((code >> j) & 1) {
            bars.push(`<rect x="${i * 20 + j * 2 + 10}" y="5" width="1.5" height="30" fill="black"/>`)
          }
        }
        return bars.join('')
      }).join('')}
    </svg>
  `)}`
}
void _generateBarcodeDataUrl

// ============================================================================
// Template Generator
// ============================================================================

export function generatePackingSlipHtml(data: PackingSlipData): string {
  const {
    orderNumber,
    orderDate,
    shipWindowStart,
    shipWindowEnd,
    customerPO,
    shipmentNumber,
    totalShipments,
    shipDate,
    carrier,
    trackingNumber,
    shipTo,
    items,
    totalItems,
    totalUnits,
  } = data

  // Generate item rows
  const itemRows = items
    .map(
      (item, index) => `
      <tr>
        <td class="cell-index">${index + 1}</td>
        <td class="cell-sku">${escapeHtml(item.sku)}</td>
        <td class="cell-product">${escapeHtml(item.productName)}</td>
        <td class="cell-color">${item.color ? escapeHtml(item.color) : '—'}</td>
        <td class="cell-size">${item.size || '—'}</td>
        <td class="cell-qty">${item.quantity}</td>
        <td class="cell-check">
          <div class="checkbox"></div>
        </td>
      </tr>
    `
    )
    .join('')

  const content = `
    <div class="packing-slip">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <h1 class="title">PACKING SLIP</h1>
          <div class="order-badge">Order ${escapeHtml(orderNumber)}</div>
        </div>
        <div class="header-right">
          <div class="barcode-container">
            <svg class="barcode" viewBox="0 0 200 50">
              <!-- Simple barcode representation -->
              ${Array.from({ length: 40 }, (_, i) => 
                `<rect x="${i * 5}" y="0" width="${Math.random() > 0.5 ? 3 : 1.5}" height="35" fill="black"/>`
              ).join('')}
              <text x="100" y="48" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold">${escapeHtml(orderNumber)}</text>
            </svg>
          </div>
        </div>
      </header>

      <!-- Info Section -->
      <div class="info-grid">
        <!-- Ship To (Large, Prominent) -->
        <div class="info-card ship-to">
          <div class="info-header">
            <span class="icon">📦</span>
            SHIP TO
          </div>
          <div class="info-body address">
            <div class="address-name">${escapeHtml(shipTo.name)}</div>
            <div>${escapeHtml(shipTo.street1)}</div>
            ${shipTo.street2 ? `<div>${escapeHtml(shipTo.street2)}</div>` : ''}
            <div>${escapeHtml(shipTo.city)}, ${escapeHtml(shipTo.stateProvince)} ${escapeHtml(shipTo.zipPostal)}</div>
            <div>${escapeHtml(shipTo.country)}</div>
          </div>
        </div>

        <!-- Order & Shipment Info -->
        <div class="info-card order-info">
          <div class="info-header">
            <span class="icon">📋</span>
            ORDER DETAILS
          </div>
          <div class="info-body">
            <div class="info-row">
              <span class="label">Order #:</span>
              <span class="value">${escapeHtml(orderNumber)}</span>
            </div>
            <div class="info-row">
              <span class="label">Order Date:</span>
              <span class="value">${formatDate(orderDate)}</span>
            </div>
            ${customerPO ? `
            <div class="info-row">
              <span class="label">Customer PO:</span>
              <span class="value">${escapeHtml(customerPO)}</span>
            </div>
            ` : ''}
            <div class="info-row">
              <span class="label">Ship Window:</span>
              <span class="value">${formatShipWindow(shipWindowStart, shipWindowEnd)}</span>
            </div>
            <div class="divider"></div>
            <div class="info-row">
              <span class="label">Shipment:</span>
              <span class="value highlight">${shipmentNumber} of ${totalShipments}</span>
            </div>
            <div class="info-row">
              <span class="label">Ship Date:</span>
              <span class="value">${formatDate(shipDate)}</span>
            </div>
            ${carrier ? `
            <div class="info-row">
              <span class="label">Carrier:</span>
              <span class="value">${escapeHtml(carrier)}</span>
            </div>
            ` : ''}
            ${trackingNumber ? `
            <div class="info-row">
              <span class="label">Tracking:</span>
              <span class="value mono">${escapeHtml(trackingNumber)}</span>
            </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <div class="items-section">
        <div class="items-header">
          <span class="icon">📦</span>
          ITEMS TO SHIP
          <span class="items-count">${totalItems} item${totalItems !== 1 ? 's' : ''}, ${totalUnits} unit${totalUnits !== 1 ? 's' : ''}</span>
        </div>
        <table class="items-table">
          <thead>
            <tr>
              <th class="th-index">#</th>
              <th class="th-sku">SKU</th>
              <th class="th-product">Product</th>
              <th class="th-color">Color</th>
              <th class="th-size">Size</th>
              <th class="th-qty">Qty</th>
              <th class="th-check">Picked</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" class="tfoot-label">Total Units:</td>
              <td class="tfoot-total">${totalUnits}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Footer / Signature Section -->
      <footer class="footer">
        <div class="signature-grid">
          <div class="signature-item">
            <span class="signature-label">Boxes:</span>
            <span class="signature-line"></span>
          </div>
          <div class="signature-item">
            <span class="signature-label">Weight:</span>
            <span class="signature-line"></span>
          </div>
          <div class="signature-item">
            <span class="signature-label">Packed by:</span>
            <span class="signature-line"></span>
          </div>
          <div class="signature-item">
            <span class="signature-label">Date:</span>
            <span class="signature-line"></span>
          </div>
        </div>
        <div class="footer-note">
          Please verify all items before sealing. Report any discrepancies immediately.
        </div>
      </footer>
    </div>

    <style>
      /* ===== Base ===== */
      * { box-sizing: border-box; }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 10pt;
        color: #1a1a1a;
        line-height: 1.4;
        margin: 0;
        padding: 0;
      }

      .packing-slip {
        padding: 0;
      }

      .icon {
        margin-right: 6px;
      }

      /* ===== Header ===== */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 16px;
        border-bottom: 3px solid #171717;
        margin-bottom: 20px;
      }

      .title {
        font-size: 28pt;
        font-weight: 800;
        color: #171717;
        margin: 0 0 8px 0;
        letter-spacing: -1px;
      }

      .order-badge {
        display: inline-block;
        background: #171717;
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 11pt;
        font-weight: 600;
      }

      .barcode-container {
        text-align: right;
      }

      .barcode {
        width: 180px;
        height: 50px;
      }

      /* ===== Info Grid ===== */
      .info-grid {
        display: flex;
        gap: 20px;
        margin-bottom: 24px;
      }

      .info-card {
        flex: 1;
        border: 2px solid #d4d4d4;
        border-radius: 8px;
        overflow: hidden;
      }

      .info-card.ship-to {
        flex: 1.2;
        border-color: #171717;
        border-width: 3px;
      }

      .info-header {
        background: #f5f5f5;
        padding: 10px 14px;
        font-size: 9pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #404040;
        border-bottom: 1px solid #d4d4d4;
      }

      .ship-to .info-header {
        background: #171717;
        color: white;
        border-bottom: none;
      }

      .info-body {
        padding: 14px;
      }

      .address {
        font-size: 11pt;
        line-height: 1.6;
      }

      .address-name {
        font-weight: 700;
        font-size: 13pt;
        margin-bottom: 6px;
        color: #171717;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 9pt;
      }

      .info-row .label {
        color: #737373;
      }

      .info-row .value {
        font-weight: 600;
        text-align: right;
      }

      .info-row .value.highlight {
        background: #fef3c7;
        padding: 2px 8px;
        border-radius: 4px;
        color: #92400e;
      }

      .info-row .value.mono {
        font-family: monospace;
        font-size: 8pt;
      }

      .divider {
        height: 1px;
        background: #e5e5e5;
        margin: 10px 0;
      }

      /* ===== Items Table ===== */
      .items-section {
        margin-bottom: 24px;
      }

      .items-header {
        background: #171717;
        color: white;
        padding: 10px 14px;
        font-size: 10pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-radius: 8px 8px 0 0;
        display: flex;
        align-items: center;
      }

      .items-count {
        margin-left: auto;
        font-weight: 400;
        font-size: 9pt;
        opacity: 0.8;
      }

      .items-table {
        width: 100%;
        border-collapse: collapse;
        border: 2px solid #171717;
        border-top: none;
        border-radius: 0 0 8px 8px;
        overflow: hidden;
      }

      .items-table th {
        background: #f5f5f5;
        font-weight: 600;
        text-align: left;
        padding: 10px 12px;
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #525252;
        border-bottom: 2px solid #d4d4d4;
      }

      .items-table td {
        padding: 12px;
        border-bottom: 1px solid #e5e5e5;
        vertical-align: middle;
      }

      .items-table tbody tr:nth-child(even) {
        background: #fafafa;
      }

      .items-table tbody tr:last-child td {
        border-bottom: none;
      }

      /* Column widths */
      .th-index { width: 40px; text-align: center; }
      .th-sku { width: 120px; }
      .th-product { width: auto; }
      .th-color { width: 90px; }
      .th-size { width: 60px; text-align: center; }
      .th-qty { width: 60px; text-align: center; }
      .th-check { width: 70px; text-align: center; }

      .cell-index { text-align: center; color: #737373; font-size: 9pt; }
      .cell-sku { font-family: monospace; font-weight: 600; font-size: 9pt; }
      .cell-product { font-size: 9pt; }
      .cell-color { font-size: 9pt; }
      .cell-size { text-align: center; font-weight: 500; }
      .cell-qty { text-align: center; font-weight: 700; font-size: 11pt; }
      .cell-check { text-align: center; }

      .checkbox {
        width: 22px;
        height: 22px;
        border: 2px solid #171717;
        border-radius: 4px;
        margin: 0 auto;
      }

      .items-table tfoot td {
        background: #f5f5f5;
        padding: 12px;
        border-top: 2px solid #d4d4d4;
      }

      .tfoot-label {
        text-align: right;
        font-weight: 600;
        font-size: 10pt;
      }

      .tfoot-total {
        text-align: center;
        font-weight: 700;
        font-size: 12pt;
      }

      /* ===== Footer ===== */
      .footer {
        border-top: 2px solid #d4d4d4;
        padding-top: 16px;
      }

      .signature-grid {
        display: flex;
        gap: 24px;
        margin-bottom: 16px;
      }

      .signature-item {
        flex: 1;
        display: flex;
        align-items: flex-end;
        gap: 8px;
      }

      .signature-label {
        font-size: 9pt;
        font-weight: 600;
        color: #525252;
        white-space: nowrap;
      }

      .signature-line {
        flex: 1;
        border-bottom: 1px solid #171717;
        min-width: 80px;
      }

      .footer-note {
        text-align: center;
        font-size: 8pt;
        color: #737373;
        font-style: italic;
      }

      /* ===== Print ===== */
      @media print {
        .packing-slip {
          padding: 0;
        }
        
        .items-table tr {
          page-break-inside: avoid;
        }
      }
    </style>
  `

  return wrapHtml(content, `Packing Slip - ${orderNumber}`)
}
