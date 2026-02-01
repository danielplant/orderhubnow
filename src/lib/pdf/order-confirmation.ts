/**
 * Order Confirmation PDF Template
 *
 * Professional wholesale order confirmation with two sections:
 * - Page 1: Order Summary (clean table, no images)
 * - Page 2+: Order Details Appendix (with images)
 *
 * Table headers repeat on page breaks for multi-page orders.
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
  // Unit pricing (for prepacks)
  unitsPerSku?: number // 1 for singles, 2+ for prepacks
  unitPrice?: number | null // Price per individual unit
}

interface CompanySettings {
  companyName: string
  logoUrl?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
}

// Phase 9: Type for planned shipments in PDFs
interface PlannedShipmentForPdf {
  id: string
  collectionName: string | null
  plannedShipStart: Date
  plannedShipEnd: Date
  items: LineItem[]
  subtotal: number
}

interface OrderConfirmationInput {
  order: OrderData
  items: LineItem[]
  plannedShipments?: PlannedShipmentForPdf[]
  company?: CompanySettings
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

// Extract style name from SKU (remove size suffix)
function getStyleFromSku(sku: string): string {
  const parts = sku.split('-')
  if (parts.length > 1) {
    // Remove last part if it looks like a size
    const lastPart = parts[parts.length - 1]
    if (/^\d/.test(lastPart) || /^[XSML]+$/i.test(lastPart)) {
      return parts.slice(0, -1).join('-')
    }
  }
  return sku
}

// ============================================================================
// Phase 9: Grouped Shipment Rendering
// ============================================================================

function generateGroupedSummaryHtml(
  shipments: PlannedShipmentForPdf[],
  currency: 'USD' | 'CAD'
): string {
  return shipments
    .map((shipment, index) => {
      const shipmentHeader = `
        <div class="shipment-header" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-bottom: none;
          border-radius: 6px 6px 0 0;
          ${index > 0 ? 'margin-top: 24px;' : ''}
        ">
          <span style="font-weight: 600; color: #1e293b; font-size: 13px;">
            ${shipment.collectionName || 'Available to Ship'}
          </span>
          <span style="font-size: 11px; color: #64748b;">
            Ships: ${formatShipWindow(shipment.plannedShipStart, shipment.plannedShipEnd)}
          </span>
        </div>
      `

      const itemsTable = `
        <table class="summary-table" style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-top: none;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">SKU</th>
              <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">Description</th>
              <th style="padding: 8px; text-align: center; font-size: 11px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">Qty</th>
              <th style="padding: 8px; text-align: right; font-size: 11px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">Price</th>
              <th style="padding: 8px; text-align: right; font-size: 11px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${shipment.items.map((item) => `
              <tr>
                <td style="padding: 8px; font-size: 11px; border-bottom: 1px solid #f1f5f9;">${item.sku}</td>
                <td style="padding: 8px; font-size: 11px; border-bottom: 1px solid #f1f5f9;">${item.description || '-'}</td>
                <td style="padding: 8px; font-size: 11px; text-align: center; border-bottom: 1px solid #f1f5f9;">${item.quantity}</td>
                <td style="padding: 8px; font-size: 11px; text-align: right; border-bottom: 1px solid #f1f5f9;">${formatCurrency(item.price, currency)}</td>
                <td style="padding: 8px; font-size: 11px; text-align: right; font-weight: 500; border-bottom: 1px solid #f1f5f9;">${formatCurrency(item.lineTotal, currency)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `

      const subtotalRow = `
        <div style="
          display: flex;
          justify-content: flex-end;
          padding: 8px 12px;
          background-color: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-top: none;
          font-size: 12px;
          font-weight: 500;
        ">
          Shipment Subtotal: ${formatCurrency(shipment.subtotal, currency)}
        </div>
      `

      return shipmentHeader + itemsTable + subtotalRow
    })
    .join('')
}

// ============================================================================
// Template Generator
// ============================================================================

export function generateOrderConfirmationHtml(input: OrderConfirmationInput): string {
  const { order, items, plannedShipments, company } = input

  // Phase 9: Decide rendering mode - grouped if 2+ shipments
  const useShipmentGrouping = plannedShipments && plannedShipments.length > 1
  const shipWindowDisplay = useShipmentGrouping
    ? `${plannedShipments.length} Planned Shipments`
    : formatShipWindow(order.shipStartDate, order.shipEndDate)

  // Company branding (with fallbacks for backward compatibility)
  const companyName = company?.companyName || 'OrderHub'
  const companyLogo = company?.logoUrl || null
  const companyPhone = company?.phone || '1-800-359-5171'
  const companyEmail = company?.email || 'orders@limeapple.com'
  const companyWebsite = company?.website || 'www.limeapple.com'

  // Calculate totals
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalStyles = new Set(items.map((item) => getStyleFromSku(item.sku))).size

  // Check if we have discounts
  const hasDiscounts = items.some((item) => item.discount > 0) || order.totalDiscount > 0

  // Check if any items are prepacks (units > 1)
  const hasPrepacks = items.some((item) => (item.unitsPerSku ?? 1) > 1)

  // ============================================================================
  // PAGE 1: Order Summary Table (With Thumbnails)
  // ============================================================================
  const summaryRows = items
    .map(
      (item) => {
        const piecesPerSku = item.unitsPerSku ?? 1
        const pricePerPiece = item.unitPrice ?? item.price
        const totalPieces = item.quantity * piecesPerSku
        // Combine description + color into one cell
        const styleName = [
          item.description || '',
          item.color ? `(${item.color})` : ''
        ].filter(Boolean).join(' ') || '—'
        
        return `
      <tr>
        <td class="cell-image">
          ${item.imageUrl 
            ? `<img src="${item.imageUrl}" alt="${escapeHtml(item.sku)}" class="thumb-image" />`
            : `<div class="no-thumb">—</div>`
          }
        </td>
        <td class="cell-sku">${escapeHtml(item.sku)}</td>
        <td class="cell-name">${escapeHtml(styleName)}</td>
        <td class="cell-size">${item.size || '—'}</td>
        <td class="cell-pieces-per">${piecesPerSku}</td>
        <td class="cell-qty">${item.quantity}</td>
        <td class="cell-pieces-total">${totalPieces}</td>
        <td class="cell-price-piece">${formatCurrency(pricePerPiece, order.currency)}</td>
        <td class="cell-price-sku">${formatCurrency(item.price, order.currency)}</td>
        <td class="cell-total">${formatCurrency(item.lineTotal, order.currency)}</td>
      </tr>
    `
      }
    )
    .join('')

  // ============================================================================
  // PAGE 2+: Order Details Appendix (With Images)
  // ============================================================================
  const detailRows = items
    .map(
      (item) => `
      <tr>
        <td class="detail-image">
          ${
            item.imageUrl
              ? `<img src="${item.imageUrl}" alt="${escapeHtml(item.sku)}" class="product-image" />`
              : `<div class="no-image">No Image</div>`
          }
        </td>
        <td class="detail-info">
          <div class="detail-sku">${escapeHtml(item.sku)}</div>
          ${item.description ? `<div class="detail-desc">Description: ${escapeHtml(item.description)}</div>` : ''}
          ${item.color ? `<div class="detail-color">Color: ${escapeHtml(item.color)}</div>` : ''}
          ${item.category ? `<div class="detail-category">Category: ${escapeHtml(item.category)}</div>` : ''}
        </td>
        <td class="detail-size">${item.size || '—'}</td>
        <td class="detail-qty">${item.quantity}</td>
        <td class="detail-price">${formatCurrency(item.price, order.currency)}</td>
        <td class="detail-total">${formatCurrency(item.lineTotal, order.currency)}</td>
      </tr>
    `
    )
    .join('')

  // ============================================================================
  // Build Address Sections
  // ============================================================================
  const shipToHtml = order.shipToAddress
    ? `
      <strong>${escapeHtml(order.storeName)}</strong><br/>
      ${formatAddress(order.shipToAddress)}
    `
    : `<span class="text-muted">No shipping address on file</span>`

  let billToHtml: string
  if (order.billToAddress === 'same') {
    billToHtml = `
      <strong>${escapeHtml(order.storeName)}</strong><br/>
      <em>Same as Shipping</em>
    `
  } else if (order.billToAddress) {
    billToHtml = `
      <strong>${escapeHtml(order.storeName)}</strong><br/>
      ${formatAddress(order.billToAddress)}
    `
  } else {
    billToHtml = `<span class="text-muted">No billing address on file</span>`
  }

  // Add payment terms to Bill To section
  if (order.paymentTerms) {
    billToHtml += `<div class="payment-terms">Payment Terms: <strong>${escapeHtml(order.paymentTerms)}</strong></div>`
  }

  // ============================================================================
  // Generate Full HTML
  // ============================================================================
  const content = `
    <!-- ====================================================================== -->
    <!-- PAGE 1: ORDER SUMMARY                                                  -->
    <!-- ====================================================================== -->
    <div class="page page-summary">

      <!-- Header -->
      <header class="header">
        <div class="header-brand">
          ${companyLogo
            ? `<img src="${companyLogo}" alt="${escapeHtml(companyName)}" class="logo-image" />`
            : `<div class="logo">${escapeHtml(companyName)}</div>`
          }
        </div>
        <div class="header-contact">
          <div class="contact-row"><span class="contact-icon">🌐</span>${escapeHtml(companyWebsite)}</div>
          <div class="contact-row"><span class="contact-icon">📞</span>${escapeHtml(companyPhone)}</div>
          <div class="contact-row"><span class="contact-icon">✉️</span>${escapeHtml(companyEmail)}</div>
        </div>
      </header>

      <!-- Order Metadata -->
      <div class="order-meta-bar">
        <!-- Column 1: aligns with Buyer Info -->
        <div class="meta-col">
          <div class="meta-item">
            <span class="meta-label">Order Number:</span>
            <span class="meta-value">${escapeHtml(order.orderNumber)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Order Date:</span>
            <span class="meta-value">${formatDateShort(order.orderDate)}</span>
          </div>
        </div>
        <!-- Column 2: aligns with Ship To -->
        <div class="meta-col">
          <div class="meta-item">
            <span class="meta-label">PO#:</span>
            <span class="meta-value">${order.customerPO ? escapeHtml(order.customerPO) : '—'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Ship Window:</span>
            <span class="meta-value">${shipWindowDisplay}</span>
          </div>
        </div>
        <!-- Column 3: aligns with Bill To -->
        <div class="meta-col">
          <div class="meta-item">
            <span class="meta-label">Sales Rep:</span>
            <span class="meta-value">${escapeHtml(order.salesRep)}</span>
          </div>
        </div>
      </div>

      <!-- Info Cards: Buyer | Ship To | Bill To -->
      <div class="info-grid">
        <div class="info-card">
          <div class="info-card-header">Buyer Information</div>
          <div class="info-card-body">
            <div class="info-row"><span class="info-label">Retailer:</span> ${escapeHtml(order.storeName)}</div>
            <div class="info-row"><span class="info-label">Buyer:</span> ${escapeHtml(order.buyerName)}</div>
            <div class="info-row"><span class="info-label">Email:</span> ${escapeHtml(order.customerEmail)}</div>
            <div class="info-row"><span class="info-label">Phone:</span> ${order.customerPhone ? escapeHtml(order.customerPhone) : '—'}</div>
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
      <div class="section">
        <div class="section-header">Order Summary</div>
        ${useShipmentGrouping ? generateGroupedSummaryHtml(plannedShipments, order.currency) : `
        <table class="summary-table">
          <thead>
            <tr>
              <th class="th-image">Image</th>
              <th class="th-sku">Style #</th>
              <th class="th-name">Style Name</th>
              <th class="th-size">Size</th>
              <th class="th-pieces-per">Pcs/SKU</th>
              <th class="th-qty">Qty</th>
              <th class="th-pieces-total">Pieces</th>
              <th class="th-price-piece">Price/Pc</th>
              <th class="th-price-sku">Price/SKU</th>
              <th class="th-total">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>
        `}

        <!-- Totals -->
        <div class="totals-container">
          <div class="totals-info">
            ${totalStyles} style${totalStyles !== 1 ? 's' : ''} &bull; ${totalUnits} unit${totalUnits !== 1 ? 's' : ''}
          </div>
          <div class="totals-box">
            ${
              hasDiscounts
                ? `
              <div class="totals-row">
                <span class="totals-label">Subtotal:</span>
                <span class="totals-value">${formatCurrency(order.subtotal, order.currency)}</span>
              </div>
              <div class="totals-row discount-row">
                <span class="totals-label">Discount:</span>
                <span class="totals-value">-${formatCurrency(order.totalDiscount, order.currency)}</span>
              </div>
            `
                : ''
            }
            <div class="totals-row grand-total">
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
        <div class="notes-card">
          <div class="notes-header">Buyer Notes</div>
          <div class="notes-body">${order.orderNotes ? escapeHtml(order.orderNotes) : '—'}</div>
        </div>
        <div class="notes-card">
          <div class="notes-header">Brand Notes</div>
          <div class="notes-body">${order.brandNotes ? escapeHtml(order.brandNotes) : '—'}</div>
        </div>
      </div>
      `
          : ''
      }

      <!-- Footer -->
      <footer class="summary-footer">
        <div class="footer-left">
          <span>Delivery Window: ${shipWindowDisplay}</span>
        </div>
        <div class="footer-right">
          <span>Submitted via OrderHub ✓</span>
          ${order.approvalDate ? `<span class="footer-divider">|</span><span>Approved: ${formatDateShort(order.approvalDate)}</span>` : ''}
        </div>
      </footer>
    </div>

    <!-- ====================================================================== -->
    <!-- PAGE 2+: ORDER DETAILS (APPENDIX WITH IMAGES)                          -->
    <!-- ====================================================================== -->
    <div class="page page-details">

      <header class="details-header">
        <h2>Order Details — ${escapeHtml(order.orderNumber)}</h2>
      </header>

      <table class="details-table">
        <thead>
          <tr>
            <th class="dth-image">Image</th>
            <th class="dth-info">SKU / Description</th>
            <th class="dth-size">Size</th>
            <th class="dth-qty">Qty</th>
            <th class="dth-price">Price</th>
            <th class="dth-total">Total</th>
          </tr>
        </thead>
        <tbody>
          ${detailRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="tfoot-spacer"></td>
            <td colspan="3" class="tfoot-total">
              <strong>Total # of Units: ${totalUnits}</strong>
            </td>
          </tr>
        </tfoot>
      </table>

    </div>

    <!-- ====================================================================== -->
    <!-- STYLES                                                                 -->
    <!-- ====================================================================== -->
    <style>
      /* ===== Base Styles ===== */
      * {
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 9pt;
        color: #1a1a1a;
        line-height: 1.4;
        margin: 0;
        padding: 0;
      }

      .page {
        padding: 0;
      }

      .text-muted {
        color: #737373;
        font-style: italic;
      }

      /* ===== Page Break ===== */
      .page-details {
        page-break-before: always;
      }

      /* ===== Header ===== */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 12px;
        border-bottom: 2px solid #171717;
        margin-bottom: 16px;
      }

      .logo {
        font-size: 24pt;
        font-weight: 700;
        color: #171717;
        letter-spacing: -0.5px;
      }

      .logo-image {
        max-height: 50px;
        max-width: 200px;
        object-fit: contain;
      }

      .header-contact {
        text-align: left;
        font-size: 8pt;
        color: #525252;
        line-height: 1.8;
      }

      .contact-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .contact-icon {
        font-size: 10pt;
        width: 16px;
        text-align: center;
      }

      /* ===== Order Metadata Bar ===== */
      .order-meta-bar {
        background: #f5f5f5;
        border: 1px solid #e5e5e5;
        border-radius: 4px;
        padding: 10px 14px;
        margin-bottom: 16px;
        display: flex;
        gap: 12px;
      }

      .meta-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .meta-item {
        display: flex;
        gap: 6px;
      }

      .meta-label {
        color: #737373;
        font-size: 8pt;
      }

      .meta-value {
        font-weight: 600;
        font-size: 8pt;
      }

      .status-badge {
        display: inline-block;
        padding: 1px 8px;
        border-radius: 3px;
        font-size: 7pt;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .status-pending { background: #fef3c7; color: #92400e; }
      .status-processing { background: #dbeafe; color: #1e40af; }
      .status-shipped { background: #d1fae5; color: #065f46; }
      .status-invoiced { background: #f3e8ff; color: #6b21a8; }
      .status-cancelled { background: #fee2e2; color: #991b1b; }

      /* ===== Info Grid (3 columns) ===== */
      .info-grid {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
      }

      .info-card {
        flex: 1;
        border: 1px solid #d4d4d4;
        border-radius: 4px;
        overflow: hidden;
      }

      .info-card-header {
        background: #e5e5e5;
        padding: 6px 10px;
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #404040;
      }

      .info-card-body {
        padding: 10px;
        font-size: 8pt;
        line-height: 1.6;
        min-height: 90px;
      }

      .info-row {
        margin-bottom: 2px;
      }

      .info-label {
        color: #737373;
      }

      .payment-terms {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #e5e5e5;
      }

      /* ===== Section Header ===== */
      .section {
        margin-bottom: 16px;
      }

      .section-header {
        font-size: 10pt;
        font-weight: 700;
        padding: 6px 0;
        border-bottom: 2px solid #171717;
        margin-bottom: 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* ===== Summary Table (No Images) ===== */
      .summary-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8pt;
      }

      .summary-table thead {
        display: table-header-group; /* Repeat headers on page break */
      }

      .summary-table th {
        background: #f5f5f5;
        font-weight: 600;
        text-align: left;
        padding: 8px 6px;
        border-bottom: 1px solid #d4d4d4;
        font-size: 7pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #525252;
      }

      .summary-table td {
        padding: 8px 6px;
        border-bottom: 1px solid #e5e5e5;
        vertical-align: middle;
      }

      .summary-table tbody tr:last-child td {
        border-bottom: 1px solid #d4d4d4;
      }

      /* Summary Table Column Widths */
      .th-image { width: 50px; text-align: center; }
      .th-sku { width: 100px; }
      .th-name { width: auto; }
      .th-size { width: 45px; text-align: center; }
      .th-qty { width: 40px; text-align: center; }
      .th-pieces-per { width: 50px; text-align: center; }
      .th-pieces-total { width: 50px; text-align: center; }
      .th-price-sku { width: 65px; text-align: right; }
      .th-price-piece { width: 65px; text-align: right; }
      .th-total { width: 75px; text-align: right; }

      .cell-image { text-align: center; vertical-align: middle; }
      .cell-sku { font-weight: 600; font-size: 7pt; white-space: nowrap; }
      .cell-name { font-size: 7pt; }
      .cell-size { text-align: center; }
      .cell-qty { text-align: center; font-weight: 500; }
      .cell-pieces-per { text-align: center; font-size: 7pt; color: #525252; }
      .cell-pieces-total { text-align: center; font-weight: 500; }
      .cell-price-sku { text-align: right; }
      .cell-price-piece { text-align: right; font-size: 7pt; color: #525252; }
      .cell-total { text-align: right; font-weight: 600; }

      /* Thumbnail image in summary table */
      .thumb-image {
        width: 40px;
        height: 40px;
        object-fit: contain;
        border-radius: 2px;
      }

      .no-thumb {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #a3a3a3;
        font-size: 7pt;
      }

      /* ===== Totals Container ===== */
      .totals-container {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 12px 0;
      }

      .totals-info {
        font-size: 8pt;
        color: #737373;
      }

      .totals-box {
        text-align: right;
      }

      .totals-row {
        display: flex;
        justify-content: flex-end;
        gap: 20px;
        padding: 3px 0;
        font-size: 8pt;
      }

      .totals-label {
        color: #525252;
      }

      .totals-value {
        min-width: 90px;
        text-align: right;
      }

      .discount-row .totals-value {
        color: #16a34a;
      }

      .grand-total {
        font-size: 10pt;
        font-weight: 700;
        padding-top: 6px;
        margin-top: 4px;
        border-top: 2px solid #171717;
      }

      .grand-total .totals-label,
      .grand-total .totals-value {
        color: #171717;
      }

      /* ===== Notes Grid ===== */
      .notes-grid {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
      }

      .notes-card {
        flex: 1;
        border: 1px solid #d4d4d4;
        border-radius: 4px;
        overflow: hidden;
      }

      .notes-header {
        background: #f5f5f5;
        padding: 6px 10px;
        font-size: 8pt;
        font-weight: 600;
        color: #525252;
        border-bottom: 1px solid #d4d4d4;
      }

      .notes-body {
        padding: 10px;
        font-size: 8pt;
        color: #404040;
        white-space: pre-wrap;
        line-height: 1.5;
        min-height: 40px;
      }

      /* ===== Summary Footer ===== */
      .summary-footer {
        padding-top: 12px;
        border-top: 1px solid #d4d4d4;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 8pt;
        color: #525252;
      }

      .footer-divider {
        margin: 0 8px;
        color: #d4d4d4;
      }

      /* ===== Details Page (Appendix) ===== */
      .details-header {
        text-align: center;
        padding-bottom: 12px;
        border-bottom: 2px solid #171717;
        margin-bottom: 16px;
      }

      .details-header h2 {
        font-size: 14pt;
        font-weight: 700;
        margin: 0;
        color: #171717;
      }

      /* ===== Details Table (With Images) ===== */
      .details-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8pt;
      }

      .details-table thead {
        display: table-header-group; /* Repeat headers on page break */
      }

      .details-table th {
        background: #f5f5f5;
        font-weight: 600;
        text-align: left;
        padding: 10px 8px;
        border: 1px solid #d4d4d4;
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #404040;
      }

      .details-table td {
        padding: 10px 8px;
        border: 1px solid #d4d4d4;
        vertical-align: top;
      }

      /* Details Table Column Widths */
      .dth-image { width: 90px; text-align: center; }
      .dth-info { width: auto; }
      .dth-size { width: 60px; text-align: center; }
      .dth-qty { width: 60px; text-align: center; }
      .dth-price { width: 80px; text-align: right; }
      .dth-total { width: 90px; text-align: right; }

      .detail-image {
        text-align: center;
        vertical-align: middle;
      }

      .product-image {
        max-width: 80px;
        max-height: 100px;
        object-fit: contain;
        border-radius: 3px;
      }

      .no-image {
        width: 80px;
        height: 80px;
        background: #f5f5f5;
        border: 1px solid #e5e5e5;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #a3a3a3;
        font-size: 8pt;
        border-radius: 3px;
        margin: 0 auto;
      }

      .detail-info {
        vertical-align: top;
      }

      .detail-sku {
        font-weight: 700;
        font-size: 9pt;
        margin-bottom: 6px;
      }

      .detail-desc,
      .detail-color,
      .detail-category {
        font-size: 8pt;
        color: #525252;
        margin-bottom: 2px;
      }

      .detail-size {
        text-align: center;
        vertical-align: middle;
        font-size: 9pt;
      }

      .detail-qty {
        text-align: center;
        vertical-align: middle;
        font-size: 9pt;
        font-weight: 600;
      }

      .detail-price {
        text-align: right;
        vertical-align: middle;
      }

      .detail-total {
        text-align: right;
        vertical-align: middle;
        font-weight: 600;
      }

      .details-table tfoot td {
        background: #f5f5f5;
        padding: 10px 8px;
      }

      .tfoot-spacer {
        border: none !important;
        background: transparent !important;
      }

      .tfoot-total {
        text-align: right;
        font-size: 9pt;
      }

      /* ===== Print Styles ===== */
      @media print {
        .page-details {
          page-break-before: always;
        }

        .summary-table thead,
        .details-table thead {
          display: table-header-group;
        }

        .summary-table tr,
        .details-table tr {
          page-break-inside: avoid;
        }

        .notes-grid {
          page-break-inside: avoid;
        }

        .totals-container {
          page-break-inside: avoid;
        }
      }
    </style>
  `

  return wrapHtml(content, `Order Confirmation - ${order.orderNumber}`)
}
