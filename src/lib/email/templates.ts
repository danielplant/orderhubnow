/**
 * Email HTML Templates
 *
 * Plain HTML templates matching .NET EmailTemplates structure.
 */

import { APP_NAME } from '@/lib/constants/brand'

interface OrderEmailData {
  orderNumber: string
  storeName: string
  buyerName: string
  customerEmail: string
  customerPhone: string
  salesRep: string
  orderAmount: number
  currency: 'USD' | 'CAD'
  shipStartDate: string
  shipEndDate: string
  orderDate: string
  orderNotes?: string
  customerPO?: string
  items: Array<{
    sku: string
    quantity: number
    price: number
    lineTotal: number
  }>
}

// Phase 9: Type for planned shipments in emails
export interface PlannedShipmentForEmail {
  id: string
  collectionName: string | null
  plannedShipStart: string
  plannedShipEnd: string
  items: Array<{
    sku: string
    quantity: number
    price: number
    lineTotal: number
  }>
  subtotal: number
}

// Phase 9: Generate grouped items HTML for multi-shipment orders
function generateGroupedItemsHtml(
  shipments: PlannedShipmentForEmail[],
  currency: 'USD' | 'CAD'
): string {
  return shipments
    .map(
      (shipment) => `
      <tr>
        <td colspan="4" style="padding: 16px 10px 8px; background-color: #f8fafc; border-bottom: 2px solid #e5e5e5;">
          <strong style="color: #1e293b; font-size: 14px;">${shipment.collectionName || 'Available to Ship'}</strong>
          <span style="color: #64748b; font-size: 13px; margin-left: 12px;">Ships: ${shipment.plannedShipStart} - ${shipment.plannedShipEnd}</span>
        </td>
      </tr>
      ${shipment.items.map((item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">${item.sku}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatCurrency(item.price, currency)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatCurrency(item.lineTotal, currency)}</td>
        </tr>
      `).join('')}
    `).join('')
}

function formatCurrency(amount: number, currency: 'USD' | 'CAD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Customer Order Confirmation Email
 * Phase 9: Added shipments parameter for grouped rendering
 */
export function customerConfirmationHtml(data: OrderEmailData, shipments?: PlannedShipmentForEmail[]): string {
  // Phase 9: Use grouped rendering if 2+ shipments
  const useGrouping = shipments && shipments.length > 1
  const shipWindowDisplay = useGrouping
    ? `${shipments.length} planned shipments (see below)`
    : `${data.shipStartDate} - ${data.shipEndDate}`

  const itemRows = useGrouping
    ? generateGroupedItemsHtml(shipments, data.currency)
    : data.items.map(
        (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">${item.sku}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatCurrency(item.price, data.currency)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: 500;">${formatCurrency(item.lineTotal, data.currency)}</td>
        </tr>
      `
      ).join('')

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
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 32px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #171717;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px; text-align: center; background-color: #f0fdf4;">
              <h2 style="margin: 0 0 8px 0; font-size: 24px; color: #16a34a;">Order Confirmed!</h2>
              <p style="margin: 0; font-size: 16px; color: #475569;">
                Thank you for your order, ${data.buyerName}. We've received your order and it's being processed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #171717;">Order Details</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; width: 140px;">Order Number:</td>
                  <td style="padding: 6px 0; font-weight: 600; color: #171717;">${data.orderNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Order Date:</td>
                  <td style="padding: 6px 0; color: #1e293b;">${data.orderDate}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Store:</td>
                  <td style="padding: 6px 0; color: #1e293b;">${data.storeName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Sales Rep:</td>
                  <td style="padding: 6px 0; color: #1e293b;">${data.salesRep}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Ship Window:</td>
                  <td style="padding: 6px 0; color: #1e293b;">${shipWindowDisplay}</td>
                </tr>
                ${data.customerPO ? `
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Customer PO:</td>
                  <td style="padding: 6px 0; color: #1e293b;">${data.customerPO}</td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #171717;">Order Items</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f8fafc;">
                    <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e5e5e5;">SKU</th>
                    <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e5e5e5;">Qty</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e5e5e5;">Price</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e5e5e5;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px; font-size: 16px; font-weight: 500; color: #475569;">Order Total:</td>
                  <td style="padding: 16px; text-align: right; font-size: 24px; font-weight: 700; color: #171717;">${formatCurrency(data.orderAmount, data.currency)}</td>
                </tr>
              </table>
            </td>
          </tr>
          ${data.orderNotes ? `
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 16px;">
                <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #92400e;">Order Notes</h4>
                <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-wrap;">${data.orderNotes}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 32px; text-align: center; border-top: 1px solid #e5e5e5; background-color: #f8fafc;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">
                Questions about your order? Contact your sales representative or reply to this email.
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                A PDF copy of your order confirmation is attached.
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

/**
 * Sales Team Order Notification Email
 * Phase 9: Added shipments parameter for grouped rendering
 */
export function salesNotificationHtml(data: OrderEmailData & { adminUrl: string }, shipments?: PlannedShipmentForEmail[]): string {
  // Phase 9: Use grouped rendering if 2+ shipments
  const useGrouping = shipments && shipments.length > 1
  const shipmentSummary = useGrouping
    ? `${shipments.length} shipments`
    : `${data.items.length} item${data.items.length !== 1 ? 's' : ''}`

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
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 24px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #171717;">${APP_NAME}</h1>
              <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">New Order Notification</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px; text-align: center; background-color: #f8fafc;">
              <h2 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: #171717;">Order #${data.orderNumber}</h2>
              <p style="margin: 0; font-size: 14px; color: #64748b;">
                ${data.orderDate} - ${data.items.length} item${data.items.length !== 1 ? 's' : ''} - ${formatCurrency(data.orderAmount, data.currency)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px;">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #171717;">Customer</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 4px 0; color: #64748b; width: 100px;">Store:</td>
                  <td style="padding: 4px 0; font-weight: 500; color: #1e293b;">${data.storeName}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Contact:</td>
                  <td style="padding: 4px 0; color: #1e293b;">${data.buyerName}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Email:</td>
                  <td style="padding: 4px 0;"><a href="mailto:${data.customerEmail}" style="color: #2563eb; text-decoration: none;">${data.customerEmail}</a></td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Phone:</td>
                  <td style="padding: 4px 0;"><a href="tel:${data.customerPhone}" style="color: #2563eb; text-decoration: none;">${data.customerPhone}</a></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 24px 24px;">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #171717;">Order Details</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 4px 0; color: #64748b; width: 100px;">Sales Rep:</td>
                  <td style="padding: 4px 0; color: #1e293b;">${data.salesRep}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Ship Window:</td>
                  <td style="padding: 4px 0; color: #1e293b;">${data.shipStartDate} - ${data.shipEndDate}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Currency:</td>
                  <td style="padding: 4px 0; color: #1e293b;">${data.currency}</td>
                </tr>
                ${data.customerPO ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Customer PO:</td>
                  <td style="padding: 4px 0; color: #1e293b;">${data.customerPO}</td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>
          ${data.orderNotes ? `
          <tr>
            <td style="padding: 0 24px 24px 24px;">
              <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 16px;">
                <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #92400e;">Order Notes</h4>
                <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-wrap;">${data.orderNotes}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 0 24px 24px 24px; text-align: center;">
              <a href="${data.adminUrl}" style="display: inline-block; background-color: #171717; color: #ffffff; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; text-decoration: none;">
                View Order in Admin
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px; text-align: center; border-top: 1px solid #e5e5e5; background-color: #f8fafc;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                This is an automated notification from ${APP_NAME}.
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
