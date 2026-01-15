/**
 * Shipping Invoice PDF Template
 *
 * Customer-facing invoice document for a shipment:
 * - Professional invoice layout
 * - Ship-To and Bill-To addresses
 * - Line items with prices
 * - Shipment totals and order balance
 * - Payment terms and due date
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

interface InvoiceItem {
  sku: string
  productName: string
  size?: string
  color?: string
  quantity: number
  unitPrice: number // Pack price (price for one SKU unit)
  lineTotal: number
  // Unit pricing (for prepacks)
  unitsPerSku?: number // 1 for singles, 2+ for prepacks
  perUnitPrice?: number | null // Price per individual unit (unitPrice / unitsPerSku)
}

interface ShippingInvoiceData {
  // Company info
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  companyWebsite: string
  
  // Invoice info
  invoiceNumber: string
  invoiceDate: Date
  dueDate?: Date
  paymentTerms?: string
  
  // Order info
  orderNumber: string
  orderDate: Date
  customerPO?: string
  salesRep: string
  
  // Shipment info
  shipmentNumber: number
  totalShipments: number
  shipDate: Date
  carrier?: string
  trackingNumber?: string
  
  // Addresses
  shipTo: Address
  billTo: Address | 'same'
  
  // Items
  items: InvoiceItem[]
  
  // Totals
  currency: 'USD' | 'CAD'
  subtotal: number
  shippingCost: number
  taxRate?: number
  taxAmount?: number
  invoiceTotal: number
  
  // Order balance info
  orderTotal: number
  previouslyInvoiced: number
  remainingBalance: number
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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatAddress(address: Address): string {
  const lines = [
    address.name,
    address.street1,
    address.street2,
    `${address.city}, ${address.stateProvince} ${address.zipPostal}`,
    address.country,
  ].filter(Boolean)
  return lines.join('<br/>')
}

// ============================================================================
// Template Generator
// ============================================================================

export function generateShippingInvoiceHtml(data: ShippingInvoiceData): string {
  const {
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyWebsite,
    invoiceNumber,
    invoiceDate,
    dueDate,
    paymentTerms,
    orderNumber,
    orderDate,
    customerPO,
    salesRep,
    shipmentNumber,
    totalShipments,
    shipDate,
    carrier,
    trackingNumber,
    shipTo,
    billTo,
    items,
    currency,
    subtotal,
    shippingCost,
    taxRate,
    taxAmount,
    invoiceTotal,
    orderTotal,
    previouslyInvoiced,
    remainingBalance,
  } = data

  // Calculate item count and unit count
  const totalItems = items.length
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0)

  // Build bill-to address
  const billToAddress = billTo === 'same' ? shipTo : billTo
  const isSameAddress = billTo === 'same'

  // Check if any items are prepacks (units > 1)
  const hasPrepacks = items.some((item) => (item.unitsPerSku ?? 1) > 1)

  // Generate item rows
  const itemRows = items
    .map(
      (item) => {
        const units = item.unitsPerSku ?? 1
        const perUnitPrice = item.perUnitPrice ?? item.unitPrice
        return `
      <tr>
        <td class="cell-sku">${escapeHtml(item.sku)}</td>
        <td class="cell-product">
          ${escapeHtml(item.productName)}
          ${item.color ? `<span class="item-meta">Color: ${escapeHtml(item.color)}</span>` : ''}
        </td>
        <td class="cell-size">${item.size || '—'}</td>
        <td class="cell-qty">${item.quantity}</td>
        ${hasPrepacks ? `<td class="cell-units">${units > 1 ? `${units}pc` : '1'}</td>` : ''}
        <td class="cell-price">${formatCurrency(item.unitPrice, currency)}</td>
        ${hasPrepacks ? `<td class="cell-per-unit">${formatCurrency(perUnitPrice, currency)}</td>` : ''}
        <td class="cell-total">${formatCurrency(item.lineTotal, currency)}</td>
      </tr>
    `
      }
    )
    .join('')

  const content = `
    <div class="invoice">
      <!-- Header -->
      <header class="header">
        <div class="header-brand">
          <div class="logo">${escapeHtml(companyName)}</div>
          <div class="company-info">
            ${escapeHtml(companyAddress)}<br/>
            Tel: ${escapeHtml(companyPhone)}<br/>
            ${escapeHtml(companyEmail)}<br/>
            ${escapeHtml(companyWebsite)}
          </div>
        </div>
        <div class="header-invoice">
          <h1 class="invoice-title">SHIPPING INVOICE</h1>
          <div class="invoice-meta">
            <div class="meta-row">
              <span class="meta-label">Invoice #:</span>
              <span class="meta-value">${escapeHtml(invoiceNumber)}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Date:</span>
              <span class="meta-value">${formatDateShort(invoiceDate)}</span>
            </div>
            ${dueDate ? `
            <div class="meta-row due-date">
              <span class="meta-label">Due Date:</span>
              <span class="meta-value">${formatDateShort(dueDate)}</span>
            </div>
            ` : ''}
            ${paymentTerms ? `
            <div class="meta-row">
              <span class="meta-label">Terms:</span>
              <span class="meta-value">${escapeHtml(paymentTerms)}</span>
            </div>
            ` : ''}
          </div>
        </div>
      </header>

      <!-- Order Reference Bar -->
      <div class="order-bar">
        <div class="order-item">
          <span class="order-label">Order #:</span>
          <span class="order-value">${escapeHtml(orderNumber)}</span>
        </div>
        <div class="order-item">
          <span class="order-label">Order Date:</span>
          <span class="order-value">${formatDateShort(orderDate)}</span>
        </div>
        ${customerPO ? `
        <div class="order-item">
          <span class="order-label">PO #:</span>
          <span class="order-value">${escapeHtml(customerPO)}</span>
        </div>
        ` : ''}
        <div class="order-item">
          <span class="order-label">Sales Rep:</span>
          <span class="order-value">${escapeHtml(salesRep)}</span>
        </div>
        <div class="order-item shipment-badge">
          <span class="order-label">Shipment:</span>
          <span class="order-value">${shipmentNumber} of ${totalShipments}</span>
        </div>
      </div>

      <!-- Addresses -->
      <div class="address-grid">
        <div class="address-card">
          <div class="address-header">SHIP TO</div>
          <div class="address-body">
            ${formatAddress(shipTo)}
          </div>
        </div>
        <div class="address-card">
          <div class="address-header">BILL TO</div>
          <div class="address-body">
            ${isSameAddress ? '<em>Same as Ship To</em>' : formatAddress(billToAddress)}
          </div>
        </div>
        <div class="address-card shipping-info">
          <div class="address-header">SHIPPING INFO</div>
          <div class="address-body">
            <div class="ship-row">
              <span class="ship-label">Ship Date:</span>
              <span class="ship-value">${formatDateShort(shipDate)}</span>
            </div>
            ${carrier ? `
            <div class="ship-row">
              <span class="ship-label">Carrier:</span>
              <span class="ship-value">${escapeHtml(carrier)}</span>
            </div>
            ` : ''}
            ${trackingNumber ? `
            <div class="ship-row">
              <span class="ship-label">Tracking:</span>
              <span class="ship-value mono">${escapeHtml(trackingNumber)}</span>
            </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <div class="items-section">
        <table class="items-table">
          <thead>
            <tr>
              <th class="th-sku">SKU</th>
              <th class="th-product">Product</th>
              <th class="th-size">Size</th>
              <th class="th-qty">Qty</th>
              ${hasPrepacks ? '<th class="th-units">Units</th>' : ''}
              <th class="th-price">${hasPrepacks ? 'Pack Price' : 'Unit Price'}</th>
              ${hasPrepacks ? '<th class="th-per-unit">Per Unit</th>' : ''}
              <th class="th-total">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
      </div>

      <!-- Totals Section -->
      <div class="totals-section">
        <div class="totals-info">
          ${totalItems} item${totalItems !== 1 ? 's' : ''} &bull; ${totalUnits} unit${totalUnits !== 1 ? 's' : ''}
        </div>
        <div class="totals-box">
          <div class="totals-row">
            <span class="totals-label">Subtotal:</span>
            <span class="totals-value">${formatCurrency(subtotal, currency)}</span>
          </div>
          <div class="totals-row">
            <span class="totals-label">Shipping:</span>
            <span class="totals-value">${shippingCost > 0 ? formatCurrency(shippingCost, currency) : '—'}</span>
          </div>
          ${taxAmount && taxAmount > 0 ? `
          <div class="totals-row">
            <span class="totals-label">Tax (${taxRate}%):</span>
            <span class="totals-value">${formatCurrency(taxAmount, currency)}</span>
          </div>
          ` : ''}
          <div class="totals-row grand-total">
            <span class="totals-label">Invoice Total:</span>
            <span class="totals-value">${formatCurrency(invoiceTotal, currency)} ${currency}</span>
          </div>
        </div>
      </div>

      <!-- Order Balance Section -->
      <div class="balance-section">
        <div class="balance-header">Order Balance Summary</div>
        <div class="balance-grid">
          <div class="balance-item">
            <span class="balance-label">Original Order Total:</span>
            <span class="balance-value">${formatCurrency(orderTotal, currency)}</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Previously Invoiced:</span>
            <span class="balance-value">${formatCurrency(previouslyInvoiced, currency)}</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">This Invoice:</span>
            <span class="balance-value">${formatCurrency(invoiceTotal, currency)}</span>
          </div>
          <div class="balance-item remaining">
            <span class="balance-label">Remaining Balance:</span>
            <span class="balance-value ${remainingBalance === 0 ? 'paid-full' : ''}">${formatCurrency(remainingBalance, currency)}</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="footer">
        <div class="footer-left">
          ${dueDate ? `<strong>Payment Due: ${formatDate(dueDate)}</strong>` : ''}
          ${paymentTerms ? `<span class="footer-terms">${escapeHtml(paymentTerms)}</span>` : ''}
        </div>
        <div class="footer-right">
          Thank you for your business!
        </div>
      </footer>

      <!-- Payment Stub (Tear-off) -->
      <div class="payment-stub">
        <div class="stub-tear"></div>
        <div class="stub-content">
          <div class="stub-left">
            <div class="stub-company">${escapeHtml(companyName)}</div>
            <div class="stub-info">Invoice #${escapeHtml(invoiceNumber)}</div>
            <div class="stub-info">Order #${escapeHtml(orderNumber)}</div>
          </div>
          <div class="stub-center">
            <div class="stub-customer">${escapeHtml(billToAddress.name)}</div>
          </div>
          <div class="stub-right">
            <div class="stub-amount-label">Amount Due:</div>
            <div class="stub-amount">${formatCurrency(invoiceTotal, currency)}</div>
            ${dueDate ? `<div class="stub-due">Due: ${formatDateShort(dueDate)}</div>` : ''}
          </div>
        </div>
      </div>
    </div>

    <style>
      /* ===== Base ===== */
      * { box-sizing: border-box; }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 9pt;
        color: #1a1a1a;
        line-height: 1.4;
        margin: 0;
        padding: 0;
      }

      .invoice {
        padding: 0;
      }

      .mono {
        font-family: monospace;
        font-size: 8pt;
      }

      /* ===== Header ===== */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 16px;
        border-bottom: 2px solid #171717;
        margin-bottom: 16px;
      }

      .logo {
        font-size: 22pt;
        font-weight: 700;
        color: #171717;
        margin-bottom: 8px;
      }

      .company-info {
        font-size: 8pt;
        color: #525252;
        line-height: 1.6;
      }

      .invoice-title {
        font-size: 24pt;
        font-weight: 800;
        color: #171717;
        margin: 0 0 12px 0;
        text-align: right;
        letter-spacing: -0.5px;
      }

      .invoice-meta {
        text-align: right;
      }

      .meta-row {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 3px 0;
        font-size: 9pt;
      }

      .meta-label {
        color: #737373;
      }

      .meta-value {
        font-weight: 600;
        min-width: 100px;
      }

      .meta-row.due-date {
        background: #fef3c7;
        padding: 4px 8px;
        border-radius: 4px;
        margin: 4px 0;
      }

      .meta-row.due-date .meta-value {
        color: #92400e;
      }

      /* ===== Order Bar ===== */
      .order-bar {
        display: flex;
        gap: 24px;
        background: #f5f5f5;
        padding: 10px 14px;
        border-radius: 6px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .order-item {
        display: flex;
        gap: 6px;
        font-size: 8pt;
      }

      .order-label {
        color: #737373;
      }

      .order-value {
        font-weight: 600;
      }

      .shipment-badge {
        background: #dbeafe;
        padding: 4px 10px;
        border-radius: 4px;
        margin-left: auto;
      }

      .shipment-badge .order-value {
        color: #1e40af;
      }

      /* ===== Address Grid ===== */
      .address-grid {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
      }

      .address-card {
        flex: 1;
        border: 1px solid #d4d4d4;
        border-radius: 6px;
        overflow: hidden;
      }

      .address-header {
        background: #e5e5e5;
        padding: 6px 10px;
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #404040;
      }

      .address-body {
        padding: 10px;
        font-size: 9pt;
        line-height: 1.6;
        min-height: 80px;
      }

      .shipping-info .ship-row {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
      }

      .ship-label {
        color: #737373;
        font-size: 8pt;
      }

      .ship-value {
        font-weight: 600;
        font-size: 8pt;
      }

      /* ===== Items Table ===== */
      .items-section {
        margin-bottom: 16px;
      }

      .items-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 9pt;
      }

      .items-table thead {
        display: table-header-group;
      }

      .items-table th {
        background: #f5f5f5;
        font-weight: 600;
        text-align: left;
        padding: 10px 8px;
        border-bottom: 2px solid #d4d4d4;
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #525252;
      }

      .items-table td {
        padding: 10px 8px;
        border-bottom: 1px solid #e5e5e5;
        vertical-align: middle;
      }

      .items-table tbody tr:last-child td {
        border-bottom: 2px solid #d4d4d4;
      }

      /* Column widths */
      .th-sku { width: 100px; }
      .th-product { width: auto; }
      .th-size { width: 60px; text-align: center; }
      .th-qty { width: 50px; text-align: center; }
      .th-units { width: 45px; text-align: center; }
      .th-price { width: 80px; text-align: right; }
      .th-per-unit { width: 70px; text-align: right; }
      .th-total { width: 90px; text-align: right; }

      .cell-sku { font-family: monospace; font-weight: 600; font-size: 8pt; }
      .cell-product { }
      .cell-size { text-align: center; }
      .cell-qty { text-align: center; font-weight: 600; }
      .cell-units { text-align: center; font-size: 8pt; color: #525252; }
      .cell-price { text-align: right; }
      .cell-per-unit { text-align: right; font-size: 8pt; color: #525252; }
      .cell-total { text-align: right; font-weight: 600; }

      .item-meta {
        display: block;
        font-size: 8pt;
        color: #737373;
        margin-top: 2px;
      }

      /* ===== Totals ===== */
      .totals-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 20px;
      }

      .totals-info {
        font-size: 9pt;
        color: #737373;
      }

      .totals-box {
        width: 280px;
      }

      .totals-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 9pt;
      }

      .totals-label {
        color: #525252;
      }

      .totals-value {
        font-weight: 500;
      }

      .grand-total {
        font-size: 12pt;
        font-weight: 700;
        padding-top: 10px;
        margin-top: 6px;
        border-top: 2px solid #171717;
      }

      .grand-total .totals-label,
      .grand-total .totals-value {
        color: #171717;
      }

      /* ===== Balance Section ===== */
      .balance-section {
        background: #f5f5f5;
        border: 1px solid #d4d4d4;
        border-radius: 6px;
        padding: 14px;
        margin-bottom: 20px;
      }

      .balance-header {
        font-size: 9pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #404040;
        margin-bottom: 10px;
      }

      .balance-grid {
        display: flex;
        gap: 20px;
      }

      .balance-item {
        flex: 1;
        text-align: center;
      }

      .balance-label {
        display: block;
        font-size: 8pt;
        color: #737373;
        margin-bottom: 4px;
      }

      .balance-value {
        font-size: 11pt;
        font-weight: 600;
      }

      .balance-item.remaining {
        background: white;
        padding: 8px;
        border-radius: 4px;
        border: 2px solid #171717;
      }

      .balance-item.remaining .balance-value {
        font-size: 13pt;
        font-weight: 700;
      }

      .balance-value.paid-full {
        color: #16a34a;
      }

      /* ===== Footer ===== */
      .footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-top: 1px solid #d4d4d4;
        font-size: 9pt;
        margin-bottom: 20px;
      }

      .footer-terms {
        margin-left: 16px;
        color: #737373;
      }

      .footer-right {
        color: #737373;
        font-style: italic;
      }

      /* ===== Payment Stub ===== */
      .payment-stub {
        border-top: 2px dashed #a3a3a3;
        padding-top: 16px;
        margin-top: 16px;
      }

      .stub-tear {
        text-align: center;
        font-size: 7pt;
        color: #a3a3a3;
        margin-bottom: 12px;
      }

      .stub-tear::before {
        content: "✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂";
        letter-spacing: 2px;
      }

      .stub-content {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .stub-company {
        font-weight: 700;
        font-size: 11pt;
        margin-bottom: 4px;
      }

      .stub-info {
        font-size: 8pt;
        color: #525252;
      }

      .stub-customer {
        font-weight: 600;
        font-size: 10pt;
      }

      .stub-right {
        text-align: right;
      }

      .stub-amount-label {
        font-size: 8pt;
        color: #737373;
      }

      .stub-amount {
        font-size: 16pt;
        font-weight: 700;
        color: #171717;
      }

      .stub-due {
        font-size: 8pt;
        color: #92400e;
        background: #fef3c7;
        padding: 2px 8px;
        border-radius: 4px;
        margin-top: 4px;
        display: inline-block;
      }

      /* ===== Print ===== */
      @media print {
        .invoice {
          padding: 0;
        }
        
        .items-table thead {
          display: table-header-group;
        }

        .items-table tr {
          page-break-inside: avoid;
        }

        .balance-section {
          page-break-inside: avoid;
        }

        .payment-stub {
          page-break-inside: avoid;
        }
      }
    </style>
  `

  return wrapHtml(content, `Invoice ${invoiceNumber} - Order ${orderNumber}`)
}
