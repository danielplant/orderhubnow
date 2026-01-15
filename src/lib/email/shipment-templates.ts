/**
 * Shipment Email Templates
 *
 * Professional HTML templates for shipment-related emails:
 * - Customer shipment confirmation
 * - Sales rep notification
 * - Tracking update
 */

import { APP_NAME } from '@/lib/constants/brand'

// ============================================================================
// Types
// ============================================================================

export interface ShipmentEmailData {
  // Order info
  orderNumber: string
  storeName: string
  buyerName: string
  customerEmail: string
  salesRep: string
  
  // Shipment info
  shipmentNumber: number
  totalShipments: number
  shipDate: Date
  carrier?: string
  trackingNumber?: string
  trackingUrl?: string
  
  // Items
  items: Array<{
    sku: string
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  
  // Totals
  currency: 'USD' | 'CAD'
  subtotal: number
  shippingCost: number
  shipmentTotal: number
  
  // Order context
  orderTotal: number
  previouslyShipped: number
  remainingBalance: number
  
  // Links
  orderTrackingUrl?: string
  adminOrderUrl?: string
}

export interface TrackingUpdateData {
  orderNumber: string
  buyerName: string
  carrier: string
  trackingNumber: string
  trackingUrl?: string
  items: Array<{
    sku: string
    productName: string
    quantity: number
  }>
}

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(amount: number, currency: 'USD' | 'CAD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ============================================================================
// Customer Shipment Confirmation Template
// ============================================================================

export function shipmentConfirmationHtml(data: ShipmentEmailData): string {
  const itemRows = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">
          <div style="font-weight: 500; color: #171717;">${item.productName}</div>
          <div style="font-size: 12px; color: #64748b; font-family: monospace;">${item.sku}</div>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatCurrency(item.unitPrice, data.currency)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 500;">${formatCurrency(item.lineTotal, data.currency)}</td>
      </tr>
    `
    )
    .join('')

  const trackingSection = data.trackingNumber
    ? `
      <tr>
        <td style="padding: 24px; background-color: #f0f9ff; border-radius: 8px;">
          <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0369a1;">Track Your Package</h3>
          <p style="margin: 0 0 12px 0; font-size: 14px; color: #475569;">
            <strong>Carrier:</strong> ${data.carrier || 'Standard Shipping'}<br/>
            <strong>Tracking Number:</strong> ${data.trackingNumber}
          </p>
          ${
            data.trackingUrl
              ? `<a href="${data.trackingUrl}" target="_blank" style="display: inline-block; background-color: #0ea5e9; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Track Package</a>`
              : ''
          }
        </td>
      </tr>
    `
    : ''

  const remainingSection =
    data.remainingBalance > 0
      ? `
      <tr>
        <td style="padding: 16px; background-color: #fefce8; border-radius: 8px; margin-top: 16px;">
          <p style="margin: 0; font-size: 14px; color: #854d0e;">
            <strong>Note:</strong> This is shipment ${data.shipmentNumber} of ${data.totalShipments}. 
            Remaining balance: ${formatCurrency(data.remainingBalance, data.currency)}
          </p>
        </td>
      </tr>
    `
      : ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f9fc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #171717;">${APP_NAME}</h1>
            </td>
          </tr>
          
          <!-- Success Banner -->
          <tr>
            <td style="padding: 32px; text-align: center; background-color: #f0fdf4;">
              <div style="font-size: 48px; margin-bottom: 16px;">📦</div>
              <h2 style="margin: 0 0 8px 0; font-size: 24px; color: #16a34a;">Your Order Has Shipped!</h2>
              <p style="margin: 0; font-size: 16px; color: #475569;">
                Hi ${data.buyerName}, great news! Your order is on its way.
              </p>
            </td>
          </tr>
          
          <!-- Shipment Details -->
          <tr>
            <td style="padding: 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #171717;">Shipment Details</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; width: 140px;">Order Number:</td>
                  <td style="padding: 6px 0; font-weight: 600; color: #171717;">${data.orderNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Ship Date:</td>
                  <td style="padding: 6px 0; color: #1e293b;">${formatDate(data.shipDate)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Shipment:</td>
                  <td style="padding: 6px 0; color: #1e293b;">${data.shipmentNumber} of ${data.totalShipments}</td>
                </tr>
              </table>
              
              <!-- Tracking Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                ${trackingSection}
              </table>
              
              <!-- Items Table -->
              <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #171717;">Items Shipped</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f8fafc;">
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase;">Product</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase;">Qty</th>
                    <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase;">Price</th>
                    <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>
              
              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Subtotal:</td>
                  <td style="padding: 8px 0; text-align: right; color: #1e293b;">${formatCurrency(data.subtotal, data.currency)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Shipping:</td>
                  <td style="padding: 8px 0; text-align: right; color: #1e293b;">${formatCurrency(data.shippingCost, data.currency)}</td>
                </tr>
                <tr style="border-top: 2px solid #e5e5e5;">
                  <td style="padding: 12px 0; font-weight: 600; color: #171717;">Shipment Total:</td>
                  <td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 18px; color: #171717;">${formatCurrency(data.shipmentTotal, data.currency)}</td>
                </tr>
              </table>
              
              <!-- Remaining Balance Note -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                ${remainingSection}
              </table>
            </td>
          </tr>
          
          <!-- Order Tracking Link -->
          ${data.orderTrackingUrl ? `
          <tr>
            <td style="padding: 24px 32px; text-align: center;">
              <a href="${data.orderTrackingUrl}" target="_blank" style="display: inline-block; background-color: #f3f4f6; color: #374151; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; border: 1px solid #d1d5db;">
                View Full Order Status
              </a>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">
                Questions about your order? Contact us at orders@${APP_NAME.toLowerCase().replace(/\s/g, '')}.com
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Thank you for your business!
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

// ============================================================================
// Sales Rep Notification Template
// ============================================================================

export function repShipmentNotificationHtml(
  data: ShipmentEmailData & { adminOrderUrl: string }
): string {
  const itemList = data.items
    .map((item) => `<li>${item.sku} - ${item.productName} (×${item.quantity})</li>`)
    .join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 24px; background-color: #0ea5e9; color: white;">
              <h1 style="margin: 0; font-size: 20px;">📦 Shipment Created</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 24px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #1e293b;">
                A shipment has been created for order <strong>${data.orderNumber}</strong>.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Store:</td>
                  <td style="padding: 8px 0; font-weight: 600;">${data.storeName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Buyer:</td>
                  <td style="padding: 8px 0;">${data.buyerName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Shipment:</td>
                  <td style="padding: 8px 0;">${data.shipmentNumber} of ${data.totalShipments}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Ship Date:</td>
                  <td style="padding: 8px 0;">${formatDate(data.shipDate)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Amount:</td>
                  <td style="padding: 8px 0; font-weight: 600;">${formatCurrency(data.shipmentTotal, data.currency)}</td>
                </tr>
                ${
                  data.trackingNumber
                    ? `
                <tr>
                  <td style="padding: 8px 0; color: #64748b;">Tracking:</td>
                  <td style="padding: 8px 0;">${data.carrier}: ${data.trackingNumber}</td>
                </tr>
                `
                    : ''
                }
              </table>
              
              <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #475569;">Items Shipped:</h3>
              <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #1e293b;">
                ${itemList}
              </ul>
              
              ${
                data.remainingBalance > 0
                  ? `<p style="margin: 0 0 20px 0; padding: 12px; background-color: #fefce8; border-radius: 6px; color: #854d0e;">
                  <strong>Note:</strong> Remaining balance of ${formatCurrency(data.remainingBalance, data.currency)} still open.
                </p>`
                  : ''
              }
              
              <a href="${data.adminOrderUrl}" style="display: inline-block; background-color: #0ea5e9; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                View Order in Admin
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

// ============================================================================
// Tracking Update Template
// ============================================================================

export function trackingUpdateHtml(data: TrackingUpdateData): string {
  const itemList = data.items
    .map((item) => `<li>${item.productName} (×${item.quantity})</li>`)
    .join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 32px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #171717;">${APP_NAME}</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 32px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">🚚</div>
              <h2 style="margin: 0 0 8px 0; font-size: 22px; color: #171717;">Tracking Information Updated</h2>
              <p style="margin: 0; font-size: 16px; color: #475569;">
                Hi ${data.buyerName}, here's your updated tracking information.
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border-radius: 8px; padding: 20px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">
                      <strong>Order:</strong> ${data.orderNumber}
                    </p>
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">
                      <strong>Carrier:</strong> ${data.carrier}
                    </p>
                    <p style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #0369a1;">
                      ${data.trackingNumber}
                    </p>
                    ${
                      data.trackingUrl
                        ? `<a href="${data.trackingUrl}" target="_blank" style="display: inline-block; background-color: #0ea5e9; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Track Your Package</a>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
              
              <h3 style="margin: 24px 0 12px 0; font-size: 16px; color: #171717;">Items in this shipment:</h3>
              <ul style="margin: 0; padding-left: 20px; color: #475569;">
                ${itemList}
              </ul>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Thank you for your business!
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}
