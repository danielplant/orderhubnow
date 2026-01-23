/**
 * Shipment Email Service
 *
 * Sends shipment-related emails:
 * - Customer shipment confirmation with optional invoice attachment
 * - Sales rep notification
 * - Tracking updates
 */

import { sendMailWithConfig } from './client'
import { getEmailSettings } from '@/lib/data/queries/settings'
import {
  shipmentConfirmationHtml,
  repShipmentNotificationHtml,
  trackingUpdateHtml,
  type ShipmentEmailData,
  type TrackingUpdateData,
} from './shipment-templates'
import { getDocument } from '@/lib/storage/document-storage'
import { getTrackingUrl } from '@/lib/types/shipment'
import { getTrackingUrl as generateOrderTrackingUrl } from '@/lib/tokens/order-tracking'
import type { Carrier } from '@/lib/types/shipment'

// ============================================================================
// Types
// ============================================================================

export interface SendShipmentEmailsOptions {
  shipmentId: string
  orderId: string
  orderNumber: string
  storeName: string
  buyerName: string
  customerEmail: string
  salesRep: string
  salesRepEmail?: string
  
  shipmentNumber: number
  totalShipments: number
  shipDate: Date
  carrier?: Carrier
  trackingNumber?: string
  
  items: Array<{
    sku: string
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  
  currency: 'USD' | 'CAD'
  subtotal: number
  shippingCost: number
  shipmentTotal: number
  
  orderTotal: number
  previouslyShipped: number
  remainingBalance: number
  
  // Email options
  notifyCustomer: boolean
  attachInvoice: boolean
  attachPackingSlip: boolean
  notifyRep: boolean
}

export interface SendShipmentEmailsResult {
  customerEmailSent: boolean
  repEmailSent: boolean
  errors: string[]
}

export interface SendTrackingUpdateOptions {
  orderNumber: string
  buyerName: string
  customerEmail: string
  carrier: Carrier
  trackingNumber: string
  items: Array<{
    sku: string
    productName: string
    quantity: number
  }>
}

// ============================================================================
// Email Service Functions
// ============================================================================

/**
 * Send shipment notification emails
 */
export async function sendShipmentEmails(
  options: SendShipmentEmailsOptions
): Promise<SendShipmentEmailsResult> {
  const result: SendShipmentEmailsResult = {
    customerEmailSent: false,
    repEmailSent: false,
    errors: [],
  }

  // Get email config from DB
  const emailConfig = await getEmailSettings()
  if (!emailConfig.FromEmail) {
    result.errors.push('From email not configured. Set in Admin → Settings → Email.')
    return result
  }

  // Build tracking URL if tracking provided
  const trackingUrl = options.trackingNumber && options.carrier
    ? getTrackingUrl(options.carrier, options.trackingNumber) || undefined
    : undefined

  // Generate order tracking page URL
  const orderTrackingUrl = options.customerEmail
    ? generateOrderTrackingUrl(options.orderId, options.customerEmail)
    : undefined

  // Build email data
  const emailData: ShipmentEmailData = {
    orderNumber: options.orderNumber,
    storeName: options.storeName,
    buyerName: options.buyerName,
    customerEmail: options.customerEmail,
    salesRep: options.salesRep,
    shipmentNumber: options.shipmentNumber,
    totalShipments: options.totalShipments,
    shipDate: options.shipDate,
    carrier: options.carrier,
    trackingNumber: options.trackingNumber,
    trackingUrl,
    items: options.items,
    currency: options.currency,
    subtotal: options.subtotal,
    shippingCost: options.shippingCost,
    shipmentTotal: options.shipmentTotal,
    orderTotal: options.orderTotal,
    previouslyShipped: options.previouslyShipped,
    remainingBalance: options.remainingBalance,
    orderTrackingUrl,
  }

  // 1. Send customer confirmation email
  if (options.notifyCustomer && options.customerEmail) {
    try {
      const customerHtml = shipmentConfirmationHtml(emailData)
      
      // Get invoice PDF if attachment requested
      const attachments: Array<{
        filename: string
        content: Buffer
        contentType: string
      }> = []
      
      if (options.attachInvoice) {
        const invoicePdf = await getDocument(options.shipmentId, 'shipping_invoice')
        if (invoicePdf) {
          attachments.push({
            filename: `INV-${options.orderNumber}-${options.shipmentNumber}.pdf`,
            content: invoicePdf,
            contentType: 'application/pdf',
          })
        }
      }

      if (options.attachPackingSlip) {
        const packingSlipPdf = await getDocument(options.shipmentId, 'packing_slip')
        if (packingSlipPdf) {
          attachments.push({
            filename: `PS-${options.orderNumber}-${options.shipmentNumber}.pdf`,
            content: packingSlipPdf,
            contentType: 'application/pdf',
          })
        }
      }

      const subject = options.totalShipments > 1
        ? `Your order ${options.orderNumber} has shipped! (Shipment ${options.shipmentNumber} of ${options.totalShipments})`
        : `Your order ${options.orderNumber} has shipped!`

      await sendMailWithConfig(emailConfig, {
        from: emailConfig.FromEmail!,
        to: options.customerEmail,
        subject,
        html: customerHtml,
        attachments,
      })

      result.customerEmailSent = true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`Customer email failed: ${message}`)
    }
  }

  // 2. Send rep notification email
  if (options.notifyRep) {
    const repEmail = options.salesRepEmail || emailConfig.SalesTeamEmails

    if (repEmail) {
      try {
        const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
        const adminOrderUrl = `${appUrl}/admin/orders/${options.orderId}`

        const repHtml = repShipmentNotificationHtml({
          ...emailData,
          adminOrderUrl,
        })

        const subject = `Shipment created: ${options.orderNumber} - ${options.storeName}`

        await sendMailWithConfig(emailConfig, {
          from: emailConfig.FromEmail!,
          to: repEmail,
          subject,
          html: repHtml,
        })

        result.repEmailSent = true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push(`Rep email failed: ${message}`)
      }
    }
  }

  // Log results
  if (result.errors.length > 0) {
    console.error('Shipment email errors:', result.errors)
  } else {
    const sent: string[] = []
    if (result.customerEmailSent) sent.push('customer')
    if (result.repEmailSent) sent.push('rep')
    if (sent.length > 0) {
      console.log(`Shipment emails sent successfully for ${options.orderNumber}: ${sent.join(', ')}`)
    }
  }

  return result
}

/**
 * Send tracking update email to customer
 */
export async function sendTrackingUpdateEmail(
  options: SendTrackingUpdateOptions
): Promise<{ sent: boolean; error?: string }> {
  try {
    // Get email config from DB
    const emailConfig = await getEmailSettings()
    if (!emailConfig.FromEmail) {
      return { sent: false, error: 'From email not configured. Set in Admin → Settings → Email.' }
    }

    const trackingUrl = getTrackingUrl(options.carrier, options.trackingNumber) || undefined

    const updateData: TrackingUpdateData = {
      orderNumber: options.orderNumber,
      buyerName: options.buyerName,
      carrier: options.carrier,
      trackingNumber: options.trackingNumber,
      trackingUrl,
      items: options.items,
    }

    const html = trackingUpdateHtml(updateData)

    await sendMailWithConfig(emailConfig, {
      from: emailConfig.FromEmail,
      to: options.customerEmail,
      subject: `Tracking update for order ${options.orderNumber}`,
      html,
    })

    console.log(`Tracking update email sent for ${options.orderNumber}`)
    return { sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Tracking update email error:', message)
    return { sent: false, error: message }
  }
}
