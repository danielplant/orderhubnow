/**
 * Order Summary PDF Template
 *
 * Generates order summary HTML matching the old limeapple PDF format.
 * Features: Pink header, company logo/contact, billing/shipping addresses,
 * product images, sizes, descriptions, categories, and total units.
 */

import { wrapHtml } from './generate'

// ============================================================================
// Types
// ============================================================================

interface Address {
  street1: string
  street2: string
  city: string
  state: string
  zip: string
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
  billingAddress: Address | null
  shippingAddress: Address | null
}

interface LineItem {
  sku: string
  quantity: number
  price: number
  currency: string
  lineTotal: number
  imageUrl: string | null
  size: string
  description: string
  category: string
}

interface CompanyInfo {
  name: string
  addressLine1: string
  addressLine2: string
  phone: string
  fax: string
  email: string
  website: string
  logoUrl: string
}

interface OrderSummaryInput {
  order: OrderData
  items: LineItem[]
  company: CompanyInfo
  totalUnits: number
}

// ============================================================================
// Helpers
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
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '/')
}

function formatShipWindow(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  return `${fmt(start)} - ${fmt(end)}`
}

// ============================================================================
// Main Template
// ============================================================================

export function generateOrderSummaryHtml(input: OrderSummaryInput): string {
  const { order, items, company, totalUnits } = input

  // Generate line items rows
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td class="image-cell">
          ${
            item.imageUrl
              ? `<img src="${item.imageUrl}" alt="${item.sku}" class="product-image" />`
              : `<div class="no-image">No Image</div>`
          }
        </td>
        <td class="sku-cell">
          <div class="sku-id">${item.sku}</div>
          ${item.description ? `<div class="sku-desc">Description: ${item.description}</div>` : ''}
          ${item.category ? `<div class="sku-category">Category: ${item.category}</div>` : ''}
        </td>
        <td class="size-cell">${item.size || ''}</td>
        <td class="qty-cell">${item.quantity}</td>
        <td class="price-cell">${formatCurrency(item.price, order.currency)}</td>
        <td class="total-cell">${formatCurrency(item.lineTotal, order.currency)}</td>
      </tr>
    `
    )
    .join('')

  // Build address rows helper
  const addressRows = (addr: Address | null, label: string) => {
    if (!addr) {
      return `
        <td colspan="4" class="section-header">${label}</td>
        </tr><tr>
        <td class="label-cell">Address Street 1:</td>
        <td class="value-cell"></td>
        <td class="label-cell">Address Street 2:</td>
        <td class="value-cell"></td>
        </tr><tr>
        <td class="label-cell">City:</td>
        <td class="value-cell"></td>
        <td class="label-cell">State:</td>
        <td class="value-cell"></td>
        </tr><tr>
        <td class="label-cell">Zip:</td>
        <td class="value-cell"></td>
        <td class="label-cell">Country:</td>
        <td class="value-cell"></td>
      `
    }
    return `
      <td colspan="4" class="section-header">${label}</td>
      </tr><tr>
      <td class="label-cell">Address Street 1:</td>
      <td class="value-cell">${addr.street1}</td>
      <td class="label-cell">Address Street 2:</td>
      <td class="value-cell">${addr.street2}</td>
      </tr><tr>
      <td class="label-cell">City:</td>
      <td class="value-cell">${addr.city}</td>
      <td class="label-cell">State:</td>
      <td class="value-cell">${addr.state}</td>
      </tr><tr>
      <td class="label-cell">Zip:</td>
      <td class="value-cell">${addr.zip}</td>
      <td class="label-cell">Country:</td>
      <td class="value-cell">${addr.country}</td>
    `
  }

  const content = `
    <div class="order-summary">
      <!-- Pink Header Banner -->
      <div class="header-banner">
        <h1>ORDER SUMMARY</h1>
      </div>

      <!-- Company Header -->
      <div class="company-header">
        <div class="company-left">
          ${
            company.logoUrl
              ? `<img src="${company.logoUrl}" alt="${company.name}" class="company-logo" />`
              : `<div class="company-name-text">${company.name}</div>`
          }
          <div class="company-address">
            ${company.addressLine1 ? `<div>${company.addressLine1}</div>` : ''}
            ${company.addressLine2 ? `<div>${company.addressLine2}</div>` : ''}
          </div>
        </div>
        <div class="company-right">
          ${company.website ? `<div><span class="contact-label">WEB:</span> ${company.website}</div>` : ''}
          ${company.phone ? `<div><span class="contact-label">TEL:</span> ${company.phone}</div>` : ''}
          ${company.fax ? `<div><span class="contact-label">FAX:</span> ${company.fax}</div>` : ''}
          ${company.email ? `<div><span class="contact-label">EMAIL:</span> ${company.email}</div>` : ''}
        </div>
      </div>

      <!-- Order Info Table -->
      <table class="info-table">
        <tbody>
          <!-- Order Number -->
          <tr>
            <td colspan="4" class="order-number-cell">Order Number: ${order.orderNumber}</td>
          </tr>

          <!-- Customer Information Section -->
          <tr>
            <td colspan="4" class="section-header">Customer Information</td>
          </tr>
          <tr>
            <td class="label-cell">Store Name:</td>
            <td class="value-cell">${order.storeName}</td>
            <td class="label-cell">Buyer Name:</td>
            <td class="value-cell">${order.buyerName}</td>
          </tr>
          <tr>
            <td class="label-cell">Sales Rep:</td>
            <td class="value-cell">${order.salesRep}</td>
            <td class="label-cell">Customer Phone:</td>
            <td class="value-cell">${order.customerPhone}</td>
          </tr>
          <tr>
            <td class="label-cell">Customer Email:</td>
            <td class="value-cell">${order.customerEmail}</td>
            <td class="label-cell">Website:</td>
            <td class="value-cell">${order.website}</td>
          </tr>

          <!-- Billing Address Section -->
          <tr>
            ${addressRows(order.billingAddress, 'Billing Address')}
          </tr>

          <!-- Shipping Address Section -->
          <tr>
            ${addressRows(order.shippingAddress, 'Shipping Address')}
          </tr>

          <!-- Order Information Section -->
          <tr>
            <td colspan="4" class="section-header">Order Information</td>
          </tr>
          <tr>
            <td class="label-cell">Order Date:</td>
            <td class="value-cell">${formatDate(order.orderDate)}</td>
            <td class="label-cell">Order Amount:</td>
            <td class="value-cell">${formatCurrency(order.orderAmount, order.currency)}</td>
          </tr>
          <tr>
            <td class="label-cell">Customer PO #:</td>
            <td class="value-cell">${order.customerPO}</td>
            <td class="label-cell">Requested Ship Window:<br/><span class="date-format">(MM/dd/yyyy)</span></td>
            <td class="value-cell">${formatShipWindow(order.shipStartDate, order.shipEndDate)}</td>
          </tr>

          <!-- Order Notes -->
          ${
            order.orderNotes
              ? `
          <tr>
            <td class="label-cell">Order Notes & Payment Info:</td>
            <td colspan="3" class="value-cell notes-cell">${order.orderNotes}</td>
          </tr>
          `
              : ''
          }
        </tbody>
      </table>

      <!-- Order Details Header -->
      <div class="order-details-header">
        <h2>ORDER DETAILS</h2>
      </div>

      <!-- Order Details Table -->
      <table class="details-table">
        <thead>
          <tr>
            <th class="image-header">Image</th>
            <th class="sku-header">Sku</th>
            <th class="size-header">Size</th>
            <th class="qty-header">Quantity Ordered</th>
            <th class="price-header">Price</th>
            <th class="total-header">Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <!-- Total Units -->
      <div class="total-units">
        Total # of Units: ${totalUnits}
      </div>
    </div>

    <style>
      .order-summary {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10pt;
        color: #000;
        max-width: 100%;
      }

      /* Header Banner */
      .header-banner {
        background-color: #FFB6C1;
        text-align: center;
        padding: 8px;
        margin-bottom: 16px;
      }

      .header-banner h1 {
        margin: 0;
        font-size: 18pt;
        font-weight: normal;
        color: #000;
      }

      /* Company Header */
      .company-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
        padding-bottom: 8px;
      }

      .company-left {
        display: flex;
        flex-direction: column;
      }

      .company-logo {
        max-height: 50px;
        max-width: 200px;
        margin-bottom: 4px;
      }

      .company-name-text {
        font-size: 24pt;
        font-weight: bold;
        font-style: italic;
        color: #000;
        margin-bottom: 4px;
      }

      .company-address {
        font-size: 9pt;
        color: #333;
        text-transform: uppercase;
      }

      .company-right {
        text-align: right;
        font-size: 9pt;
      }

      .contact-label {
        font-weight: bold;
        color: #666;
      }

      /* Info Table */
      .info-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 16px;
        border: 1px solid #000;
      }

      .info-table td {
        border: 1px solid #000;
        padding: 4px 8px;
        vertical-align: top;
      }

      .order-number-cell {
        text-align: center;
        font-weight: bold;
        background-color: #f5f5f5;
        padding: 8px;
      }

      .section-header {
        background-color: #f0f0f0;
        font-weight: bold;
        padding: 6px 8px;
      }

      .label-cell {
        width: 15%;
        font-weight: normal;
        white-space: nowrap;
      }

      .value-cell {
        width: 35%;
      }

      .notes-cell {
        white-space: pre-wrap;
      }

      .date-format {
        font-size: 8pt;
        color: #666;
      }

      /* Order Details Header */
      .order-details-header {
        text-align: center;
        margin: 16px 0;
      }

      .order-details-header h2 {
        margin: 0;
        font-size: 14pt;
        font-weight: bold;
      }

      /* Details Table */
      .details-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 8px;
      }

      .details-table th,
      .details-table td {
        border: 1px solid #000;
        padding: 6px 8px;
        vertical-align: top;
      }

      .details-table th {
        background-color: #f5f5f5;
        font-weight: bold;
        text-align: center;
        font-size: 9pt;
      }

      .image-header { width: 80px; }
      .sku-header { width: auto; }
      .size-header { width: 60px; }
      .qty-header { width: 80px; }
      .price-header { width: 70px; }
      .total-header { width: 80px; }

      .image-cell {
        text-align: center;
        vertical-align: middle;
        width: 80px;
      }

      .product-image {
        max-width: 70px;
        max-height: 90px;
        object-fit: contain;
      }

      .no-image {
        width: 70px;
        height: 70px;
        background-color: #f0f0f0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8pt;
        color: #999;
      }

      .sku-cell {
        vertical-align: top;
      }

      .sku-id {
        font-weight: bold;
        margin-bottom: 4px;
      }

      .sku-desc,
      .sku-category {
        font-size: 9pt;
        color: #333;
        margin-bottom: 2px;
      }

      .size-cell,
      .qty-cell {
        text-align: center;
        vertical-align: middle;
      }

      .price-cell,
      .total-cell {
        text-align: right;
        vertical-align: middle;
      }

      /* Total Units */
      .total-units {
        text-align: right;
        font-weight: bold;
        padding: 8px;
        border: 1px solid #000;
        border-top: none;
      }

      /* Print styles */
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .details-table {
          page-break-inside: auto;
        }

        .details-table tr {
          page-break-inside: avoid;
        }
      }
    </style>
  `

  return wrapHtml(content, `Order Summary - ${order.orderNumber}`)
}

// Export alias for backwards compatibility
export const generateOrderConfirmationHtml = generateOrderSummaryHtml
