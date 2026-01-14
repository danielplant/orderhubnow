/**
 * Order Confirmation PDF Template
 *
 * NuORDER-style professional wholesale order confirmation.
 * Features: Inline product images, Ship-To/Bill-To addresses,
 * Color/Size columns, line-level discounts, dual notes sections.
 */

import { wrapHtml } from './generate'

// ============================================================================
// Types
// ============================================================================

interface Address {
  street1: string
  street2?: string
  city: string
  stateProvince: string
  zipPostal: string
  country: string
}

interface OrderData {
  orderNumber: string
  storeName: string
  buyerName: string
  salesRep: string
  customerEmail: string
  customerPhone: string
  currency: 'USD' | 'CAD'
  orderAmount: number
  orderNotes: string
  customerPO: string
  shipStartDate: Date
  shipEndDate: Date
  orderDate: Date
  website: string
  orderStatus: string
  // Address fields
  shipToAddress: Address | null
  billToAddress: Address | 'same' | null
  // PDF configuration fields
  paymentTerms?: string
  approvalDate?: Date
  brandNotes?: string
  // Calculated totals
  subtotal: number
  totalDiscount: number
}

interface LineItem {
  sku: string
  quantity: number
  price: number
  currency: string
  lineTotal: number
  discount: number
  // Enhanced fields
  imageUrl?: string | null
  size?: string
  description?: string
  category?: string
  color?: string
  retailPrice?: number | null
}

interface OrderConfirmationInput {
  order: OrderData
  items: LineItem[]
}

// ============================================================================
// Formatters
// ============================================================================

function formatCurrency(amount: number, currency: 'USD' | 'CAD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShipWindow(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

function formatAddress(address: Address): string {
  const lines = [
    address.street1,
    address.street2,
    `${address.city}, ${address.stateProvince} ${address.zipPostal}`,
    address.country,
  ].filter(Boolean)
  return lines.join('<br/>')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ============================================================================
// Template Generator
// ============================================================================

export function generateOrderConfirmationHtml(input: OrderConfirmationInput): string {
  const { order, items } = input

  // Calculate total units
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalStyles = new Set(items.map((item) => item.sku.split('-').slice(0, -1).join('-') || item.sku)).size

  // Has any discount?
  const hasDiscounts = items.some((item) => item.discount > 0) || order.totalDiscount > 0

  // Generate line item rows with inline images
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td class="cell-image">
          ${
            item.imageUrl
              ? `<img src="${item.imageUrl}" alt="${escapeHtml(item.sku)}" class="product-image" />`
              : `<div class="no-image">—</div>`
          }
        </td>
        <td class="cell-style">
          <div class="style-number">${escapeHtml(item.sku)}</div>
          ${item.description ? `<div class="style-name">${escapeHtml(item.description)}</div>` : ''}
        </td>
        <td class="cell-color">${item.color ? escapeHtml(item.color) : '—'}</td>
        <td class="cell-size">${item.size || '—'}</td>
        <td class="cell-qty">${item.quantity}</td>
        <td class="cell-price">${formatCurrency(item.price, order.currency)}</td>
        ${hasDiscounts ? `<td class="cell-discount">${item.discount > 0 ? `${item.discount}%` : '—'}</td>` : ''}
        <td class="cell-total">${formatCurrency(item.lineTotal, order.currency)}</td>
      </tr>
    `
    )
    .join('')

  // Build Ship-To section
  const shipToHtml = order.shipToAddress
    ? `
      <div class="address-content">
        <strong>${escapeHtml(order.storeName)}</strong><br/>
        ${formatAddress(order.shipToAddress)}
      </div>
      <div class="address-meta">
        <div><span class="meta-label">Ship Window:</span> ${formatShipWindow(order.shipStartDate, order.shipEndDate)}</div>
      </div>
    `
    : `<div class="address-empty">No shipping address on file</div>`

  // Build Bill-To section
  let billToHtml: string
  if (order.billToAddress === 'same') {
    billToHtml = `
      <div class="address-content">
        <em>Same as Shipping</em>
      </div>
    `
  } else if (order.billToAddress) {
    billToHtml = `
      <div class="address-content">
        <strong>${escapeHtml(order.storeName)}</strong><br/>
        ${formatAddress(order.billToAddress)}
      </div>
    `
  } else {
    billToHtml = `<div class="address-empty">No billing address on file</div>`
  }

  // Payment terms in Bill-To section
  if (order.paymentTerms) {
    billToHtml += `
      <div class="address-meta">
        <div><span class="meta-label">Payment Terms:</span> ${escapeHtml(order.paymentTerms)}</div>
      </div>
    `
  }

  const content = `
    <div class="confirmation">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <div class="logo">OrderHub</div>
        </div>
        <div class="header-right">
          <div class="order-meta">
            <div class="order-number">Order ${escapeHtml(order.orderNumber)}</div>
            <div class="order-status status-${order.orderStatus.toLowerCase().replace(/\s+/g, '-')}">${escapeHtml(order.orderStatus)}</div>
          </div>
          <div class="order-date">${formatDate(order.orderDate)}</div>
          <div class="order-rep">Sales Rep: ${escapeHtml(order.salesRep)}</div>
        </div>
      </header>

      <!-- Info Cards: Buyer | Ship To | Bill To -->
      <div class="info-grid">
        <div class="info-card">
          <div class="info-card-header">Buyer Information</div>
          <div class="info-card-body">
            <div class="buyer-store">${escapeHtml(order.storeName)}</div>
            <div class="buyer-name">${escapeHtml(order.buyerName)}</div>
            ${order.customerEmail ? `<div class="buyer-detail">${escapeHtml(order.customerEmail)}</div>` : ''}
            ${order.customerPhone ? `<div class="buyer-detail">${escapeHtml(order.customerPhone)}</div>` : ''}
            ${order.customerPO ? `<div class="buyer-po">PO: ${escapeHtml(order.customerPO)}</div>` : ''}
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-header">Ship To</div>
          <div class="info-card-body">
            ${shipToHtml}
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-header">Bill To</div>
          <div class="info-card-body">
            ${billToHtml}
          </div>
        </div>
      </div>

      <!-- Order Summary Table -->
      <div class="order-section">
        <div class="section-header">Order Summary</div>
        <table class="order-table">
          <thead>
            <tr>
              <th class="th-image">Image</th>
              <th class="th-style">Style # / Name</th>
              <th class="th-color">Color</th>
              <th class="th-size">Size</th>
              <th class="th-qty">Qty</th>
              <th class="th-price">Wholesale</th>
              ${hasDiscounts ? '<th class="th-discount">Disc%</th>' : ''}
              <th class="th-total">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <!-- Totals -->
        <div class="totals-section">
          <div class="totals-summary">
            <div class="totals-info">
              <span>${totalStyles} style${totalStyles !== 1 ? 's' : ''}</span>
              <span class="totals-divider">•</span>
              <span>${totalUnits} unit${totalUnits !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div class="totals-amounts">
            ${
              hasDiscounts
                ? `
              <div class="totals-row">
                <span class="totals-label">Subtotal:</span>
                <span class="totals-value">${formatCurrency(order.subtotal, order.currency)}</span>
              </div>
              <div class="totals-row totals-discount">
                <span class="totals-label">Discount:</span>
                <span class="totals-value">-${formatCurrency(order.totalDiscount, order.currency)}</span>
              </div>
            `
                : ''
            }
            <div class="totals-row totals-grand">
              <span class="totals-label">Order Total:</span>
              <span class="totals-value">${formatCurrency(order.orderAmount, order.currency)} ${order.currency}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Notes Section -->
      ${
        order.orderNotes || order.brandNotes
          ? `
      <div class="notes-grid">
        ${
          order.orderNotes
            ? `
        <div class="notes-card">
          <div class="notes-header">Buyer Notes</div>
          <div class="notes-body">${escapeHtml(order.orderNotes)}</div>
        </div>
        `
            : ''
        }
        ${
          order.brandNotes
            ? `
        <div class="notes-card">
          <div class="notes-header">Brand Notes</div>
          <div class="notes-body">${escapeHtml(order.brandNotes)}</div>
        </div>
        `
            : ''
        }
      </div>
      `
          : ''
      }

      <!-- Footer -->
      <footer class="footer">
        <div class="footer-dates">
          <span>Delivery Window: ${formatShipWindow(order.shipStartDate, order.shipEndDate)}</span>
          ${order.approvalDate ? `<span class="footer-divider">|</span><span>Approved: ${formatDateShort(order.approvalDate)}</span>` : ''}
        </div>
        <div class="footer-generated">Generated ${formatDate(new Date())}</div>
      </footer>
    </div>

    <style>
      /* Base */
      .confirmation {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 9pt;
        color: #1a1a1a;
        line-height: 1.4;
      }

      /* Header */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 16px;
        border-bottom: 2px solid #171717;
        margin-bottom: 20px;
      }

      .logo {
        font-size: 22pt;
        font-weight: 700;
        color: #171717;
        letter-spacing: -0.5px;
      }

      .header-right {
        text-align: right;
      }

      .order-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        margin-bottom: 4px;
      }

      .order-number {
        font-size: 13pt;
        font-weight: 600;
        color: #171717;
      }

      .order-status {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 3px;
        font-size: 8pt;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .status-pending { background: #fef3c7; color: #92400e; }
      .status-processing { background: #dbeafe; color: #1e40af; }
      .status-shipped { background: #d1fae5; color: #065f46; }
      .status-invoiced { background: #f3e8ff; color: #6b21a8; }
      .status-cancelled { background: #fee2e2; color: #991b1b; }

      .order-date {
        font-size: 9pt;
        color: #525252;
      }

      .order-rep {
        font-size: 8pt;
        color: #737373;
        margin-top: 2px;
      }

      /* Info Grid - 3 columns */
      .info-grid {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
      }

      .info-card {
        flex: 1;
        border: 1px solid #e5e5e5;
        border-radius: 4px;
        overflow: hidden;
      }

      .info-card-header {
        background: #f5f5f5;
        padding: 6px 10px;
        font-size: 8pt;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #525252;
        border-bottom: 1px solid #e5e5e5;
      }

      .info-card-body {
        padding: 10px;
        font-size: 8pt;
        min-height: 80px;
      }

      .buyer-store {
        font-weight: 600;
        font-size: 9pt;
        margin-bottom: 2px;
      }

      .buyer-name {
        color: #525252;
        margin-bottom: 6px;
      }

      .buyer-detail {
        color: #737373;
        font-size: 8pt;
      }

      .buyer-po {
        margin-top: 8px;
        font-weight: 500;
      }

      .address-content {
        line-height: 1.5;
      }

      .address-content strong {
        font-size: 9pt;
      }

      .address-meta {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #e5e5e5;
        font-size: 8pt;
      }

      .meta-label {
        color: #737373;
      }

      .address-empty {
        color: #a3a3a3;
        font-style: italic;
      }

      /* Order Section */
      .order-section {
        margin-bottom: 20px;
      }

      .section-header {
        font-size: 10pt;
        font-weight: 600;
        padding-bottom: 8px;
        margin-bottom: 0;
        border-bottom: 1px solid #e5e5e5;
      }

      /* Order Table */
      .order-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8pt;
      }

      .order-table th {
        background: #fafafa;
        font-weight: 600;
        text-align: left;
        padding: 8px 6px;
        border-bottom: 1px solid #d4d4d4;
        font-size: 7pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #525252;
      }

      .order-table td {
        padding: 8px 6px;
        border-bottom: 1px solid #e5e5e5;
        vertical-align: middle;
      }

      .order-table tbody tr:last-child td {
        border-bottom: none;
      }

      /* Column widths */
      .th-image { width: 60px; text-align: center; }
      .th-style { width: auto; }
      .th-color { width: 70px; }
      .th-size { width: 45px; text-align: center; }
      .th-qty { width: 40px; text-align: center; }
      .th-price { width: 70px; text-align: right; }
      .th-discount { width: 50px; text-align: center; }
      .th-total { width: 75px; text-align: right; }

      /* Cell styles */
      .cell-image {
        text-align: center;
        padding: 4px 6px;
      }

      .product-image {
        max-width: 50px;
        max-height: 60px;
        object-fit: contain;
        border-radius: 2px;
      }

      .no-image {
        width: 50px;
        height: 50px;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #a3a3a3;
        font-size: 10pt;
        border-radius: 2px;
        margin: 0 auto;
      }

      .cell-style {
        vertical-align: middle;
      }

      .style-number {
        font-weight: 600;
        font-size: 8pt;
        color: #171717;
      }

      .style-name {
        font-size: 7pt;
        color: #737373;
        margin-top: 2px;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cell-color {
        font-size: 8pt;
      }

      .cell-size {
        text-align: center;
        font-size: 8pt;
      }

      .cell-qty {
        text-align: center;
        font-weight: 500;
      }

      .cell-price {
        text-align: right;
        font-size: 8pt;
      }

      .cell-discount {
        text-align: center;
        font-size: 8pt;
        color: #16a34a;
      }

      .cell-total {
        text-align: right;
        font-weight: 600;
        font-size: 8pt;
      }

      /* Totals Section */
      .totals-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 12px 0;
        border-top: 1px solid #e5e5e5;
        margin-top: 0;
      }

      .totals-summary {
        font-size: 8pt;
        color: #737373;
      }

      .totals-divider {
        margin: 0 8px;
        color: #d4d4d4;
      }

      .totals-amounts {
        text-align: right;
      }

      .totals-row {
        display: flex;
        justify-content: flex-end;
        gap: 20px;
        padding: 2px 0;
        font-size: 8pt;
      }

      .totals-label {
        color: #525252;
      }

      .totals-value {
        min-width: 80px;
        text-align: right;
      }

      .totals-discount .totals-value {
        color: #16a34a;
      }

      .totals-grand {
        font-size: 10pt;
        font-weight: 600;
        padding-top: 6px;
        margin-top: 4px;
        border-top: 1px solid #e5e5e5;
      }

      .totals-grand .totals-label {
        color: #171717;
      }

      .totals-grand .totals-value {
        color: #171717;
      }

      /* Notes Grid */
      .notes-grid {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
      }

      .notes-card {
        flex: 1;
        border: 1px solid #e5e5e5;
        border-radius: 4px;
        overflow: hidden;
      }

      .notes-header {
        background: #fafafa;
        padding: 6px 10px;
        font-size: 8pt;
        font-weight: 600;
        color: #525252;
        border-bottom: 1px solid #e5e5e5;
      }

      .notes-body {
        padding: 10px;
        font-size: 8pt;
        color: #525252;
        white-space: pre-wrap;
        line-height: 1.5;
      }

      /* Footer */
      .footer {
        padding-top: 12px;
        border-top: 1px solid #e5e5e5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 8pt;
        color: #737373;
      }

      .footer-dates {
        display: flex;
        align-items: center;
      }

      .footer-divider {
        margin: 0 10px;
        color: #d4d4d4;
      }

      .footer-generated {
        font-style: italic;
      }

      /* Print styles */
      @media print {
        .order-table {
          page-break-inside: auto;
        }

        .order-table tr {
          page-break-inside: avoid;
        }

        .notes-grid {
          page-break-inside: avoid;
        }
      }
    </style>
  `

  return wrapHtml(content, `Order Confirmation - ${order.orderNumber}`)
}
