/**
 * Order Confirmation PDF Template
 *
 * Generates customer-facing order confirmation HTML.
 * Design: Clean, professional, portrait orientation.
 */

import { wrapHtml } from './generate'

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
}

interface LineItem {
  sku: string
  quantity: number
  price: number
  currency: string
  lineTotal: number
}

interface OrderConfirmationInput {
  order: OrderData
  items: LineItem[]
}

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

function formatShipWindow(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} - ${endStr}`
}

export function generateOrderConfirmationHtml(input: OrderConfirmationInput): string {
  const { order, items } = input

  // Generate line items rows
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td class="item-sku">${item.sku}</td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">${formatCurrency(item.price, order.currency)}</td>
        <td class="text-right font-medium">${formatCurrency(item.lineTotal, order.currency)}</td>
      </tr>
    `
    )
    .join('')

  const content = `
    <div class="confirmation-container">
      <!-- Header -->
      <div class="confirmation-header">
        <div class="logo-section">
          <div class="logo">MyOrderHub</div>
          <div class="tagline">Wholesale Order Management</div>
        </div>
        <div class="order-info">
          <div class="order-number">Order #${order.orderNumber}</div>
          <div class="order-date">${formatDate(order.orderDate)}</div>
          <div class="order-status status-${order.orderStatus.toLowerCase()}">${order.orderStatus}</div>
        </div>
      </div>

      <!-- Thank You Message -->
      <div class="thank-you-section">
        <h1>Thank You for Your Order!</h1>
        <p>We've received your order and it's being processed. You'll receive a confirmation email at <strong>${order.customerEmail}</strong>.</p>
      </div>

      <!-- Customer & Order Details -->
      <div class="details-grid">
        <div class="details-card">
          <h3>Customer Information</h3>
          <div class="detail-row">
            <span class="label">Store:</span>
            <span class="value">${order.storeName}</span>
          </div>
          <div class="detail-row">
            <span class="label">Contact:</span>
            <span class="value">${order.buyerName}</span>
          </div>
          <div class="detail-row">
            <span class="label">Email:</span>
            <span class="value">${order.customerEmail}</span>
          </div>
          <div class="detail-row">
            <span class="label">Phone:</span>
            <span class="value">${order.customerPhone}</span>
          </div>
          ${order.website ? `
          <div class="detail-row">
            <span class="label">Website:</span>
            <span class="value">${order.website}</span>
          </div>
          ` : ''}
        </div>

        <div class="details-card">
          <h3>Order Details</h3>
          <div class="detail-row">
            <span class="label">Sales Rep:</span>
            <span class="value">${order.salesRep}</span>
          </div>
          <div class="detail-row">
            <span class="label">Ship Window:</span>
            <span class="value">${formatShipWindow(order.shipStartDate, order.shipEndDate)}</span>
          </div>
          ${order.customerPO ? `
          <div class="detail-row">
            <span class="label">Customer PO:</span>
            <span class="value">${order.customerPO}</span>
          </div>
          ` : ''}
          <div class="detail-row">
            <span class="label">Currency:</span>
            <span class="value">${order.currency}</span>
          </div>
        </div>
      </div>

      <!-- Line Items -->
      <div class="items-section">
        <h3>Order Items</h3>
        <table class="items-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th class="text-center">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
      </div>

      <!-- Order Total -->
      <div class="total-section">
        <div class="total-row">
          <span class="total-label">Order Total:</span>
          <span class="total-value">${formatCurrency(order.orderAmount, order.currency)}</span>
        </div>
      </div>

      ${order.orderNotes ? `
      <!-- Order Notes -->
      <div class="notes-section">
        <h3>Order Notes</h3>
        <p>${order.orderNotes}</p>
      </div>
      ` : ''}

      <!-- Footer -->
      <div class="confirmation-footer">
        <p>Questions about your order? Contact your sales representative or email us at orders@myorderhub.com</p>
        <p class="footer-date">Generated on ${formatDate(new Date())}</p>
      </div>
    </div>

    <style>
      .confirmation-container {
        max-width: 100%;
        padding: 0;
      }

      .confirmation-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 20px;
        border-bottom: 3px solid #171717;
        margin-bottom: 24px;
      }

      .logo-section .logo {
        font-size: 24pt;
        font-weight: 700;
        color: #171717;
      }

      .logo-section .tagline {
        font-size: 9pt;
        color: #666;
        margin-top: 2px;
      }

      .order-info {
        text-align: right;
      }

      .order-number {
        font-size: 14pt;
        font-weight: 600;
        color: #171717;
      }

      .order-date {
        font-size: 10pt;
        color: #666;
        margin-top: 4px;
      }

      .order-status {
        display: inline-block;
        margin-top: 8px;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 9pt;
        font-weight: 500;
      }

      .status-pending { background: #fef3c7; color: #92400e; }
      .status-processing { background: #dbeafe; color: #1e40af; }
      .status-shipped { background: #d1fae5; color: #065f46; }
      .status-invoiced { background: #f3e8ff; color: #6b21a8; }

      .thank-you-section {
        text-align: center;
        padding: 24px;
        background: #f8fafc;
        border-radius: 8px;
        margin-bottom: 24px;
      }

      .thank-you-section h1 {
        font-size: 18pt;
        color: #16a34a;
        margin-bottom: 8px;
      }

      .thank-you-section p {
        font-size: 10pt;
        color: #475569;
      }

      .details-grid {
        display: flex;
        gap: 24px;
        margin-bottom: 24px;
      }

      .details-card {
        flex: 1;
        padding: 16px;
        background: #f8fafc;
        border-radius: 6px;
      }

      .details-card h3 {
        font-size: 11pt;
        font-weight: 600;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e2e8f0;
      }

      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 9pt;
      }

      .detail-row .label {
        color: #64748b;
      }

      .detail-row .value {
        font-weight: 500;
        color: #1e293b;
      }

      .items-section {
        margin-bottom: 24px;
      }

      .items-section h3 {
        font-size: 11pt;
        font-weight: 600;
        margin-bottom: 12px;
      }

      .items-table {
        width: 100%;
        border-collapse: collapse;
      }

      .items-table th {
        background: #f1f5f9;
        font-weight: 600;
        font-size: 8pt;
        text-align: left;
        padding: 8px 10px;
        border-bottom: 2px solid #e2e8f0;
      }

      .items-table td {
        padding: 6px 10px;
        font-size: 8pt;
        border-bottom: 1px solid #e2e8f0;
      }

      .items-table .item-sku {
        font-weight: 500;
        font-size: 8pt;
        white-space: nowrap;
      }

      .items-table .text-center { text-align: center; }
      .items-table .text-right { text-align: right; }
      .items-table .font-medium { font-weight: 500; }

      .total-section {
        text-align: right;
        padding: 16px 0;
        border-top: 2px solid #171717;
      }

      .total-row {
        display: inline-flex;
        gap: 24px;
        align-items: center;
      }

      .total-label {
        font-size: 10pt;
        font-weight: 500;
      }

      .total-value {
        font-size: 14pt;
        font-weight: 700;
        color: #171717;
      }

      .notes-section {
        margin-top: 24px;
        padding: 16px;
        background: #fffbeb;
        border-radius: 6px;
        border-left: 4px solid #f59e0b;
      }

      .notes-section h3 {
        font-size: 10pt;
        font-weight: 600;
        margin-bottom: 8px;
      }

      .notes-section p {
        font-size: 9pt;
        color: #78350f;
        white-space: pre-wrap;
      }

      .confirmation-footer {
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
        text-align: center;
      }

      .confirmation-footer p {
        font-size: 8pt;
        color: #64748b;
        margin-bottom: 4px;
      }

      .footer-date {
        font-style: italic;
      }
    </style>
  `

  return wrapHtml(content, `Order Confirmation - ${order.orderNumber}`)
}
