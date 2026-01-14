/**
 * Order Email Service
 *
 * Sends order confirmation emails via SMTP.
 * Matches .NET EmailsProcessing.SendEmail() behavior.
 */

import { transporter, EMAIL_FROM, EMAIL_CC, EMAIL_SALES } from './client'
import { customerConfirmationHtml, salesNotificationHtml } from './templates'
import { generatePdf } from '@/lib/pdf/generate'
import { generateOrderConfirmationHtml } from '@/lib/pdf/order-confirmation'
import { getEmailSettings } from '@/lib/data/queries/settings'
import type { EmailSettingsRecord } from '@/lib/types/settings'

interface OrderEmailData {
  orderId: string
  orderNumber: string
  storeName: string
  buyerName: string
  customerEmail: string
  customerPhone: string
  salesRep: string
  orderAmount: number
  currency: 'USD' | 'CAD'
  shipStartDate: Date
  shipEndDate: Date
  orderDate: Date
  orderNotes?: string
  customerPO?: string
  items: Array<{
    sku: string
    quantity: number
    price: number
    lineTotal: number
  }>
}

interface SendOrderEmailsResult {
  customerEmailSent: boolean
  salesEmailSent: boolean
  errors: string[]
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Get email configuration from database with fallback to environment variables.
 */
async function getEmailConfig(): Promise<EmailSettingsRecord> {
  try {
    return await getEmailSettings()
  } catch {
    // Fallback to environment variables if DB query fails
    return {
      ID: 0,
      FromEmail: EMAIL_FROM,
      FromName: null,
      SalesTeamEmails: EMAIL_SALES,
      CCEmails: EMAIL_CC || null,
      NotifyOnNewOrder: true,
      NotifyOnOrderUpdate: false,
      SendCustomerConfirmation: true,
      UpdatedAt: new Date(),
    }
  }
}

export async function sendOrderEmails(data: OrderEmailData, isUpdate = false): Promise<SendOrderEmailsResult> {
  const result: SendOrderEmailsResult = {
    customerEmailSent: false,
    salesEmailSent: false,
    errors: [],
  }

  // Get email configuration from database
  const config = await getEmailConfig()

  // Check if we should send emails based on config
  if (isUpdate && !config.NotifyOnOrderUpdate) {
    console.log('Order update emails disabled by configuration')
    return result
  }

  if (!isUpdate && !config.NotifyOnNewOrder) {
    console.log('New order emails disabled by configuration')
    return result
  }

  const shipStartStr = formatDate(data.shipStartDate)
  const shipEndStr = formatDate(data.shipEndDate)
  const orderDateStr = formatDate(data.orderDate)

  const emailData = {
    orderNumber: data.orderNumber,
    storeName: data.storeName,
    buyerName: data.buyerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    salesRep: data.salesRep,
    orderAmount: data.orderAmount,
    currency: data.currency,
    shipStartDate: shipStartStr,
    shipEndDate: shipEndStr,
    orderDate: orderDateStr,
    orderNotes: data.orderNotes,
    customerPO: data.customerPO,
    items: data.items,
  }

  // Determine from address
  const fromEmail = config.FromEmail || EMAIL_FROM
  const fromAddress = config.FromName ? `"${config.FromName}" <${fromEmail}>` : fromEmail

  // Generate PDF attachment
  let pdfBuffer: Buffer | null = null
  try {
    const pdfHtml = generateOrderConfirmationHtml({
      order: {
        orderNumber: data.orderNumber,
        storeName: data.storeName,
        buyerName: data.buyerName,
        salesRep: data.salesRep,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        currency: data.currency,
        orderAmount: data.orderAmount,
        orderNotes: data.orderNotes || '',
        customerPO: data.customerPO || '',
        shipStartDate: data.shipStartDate,
        shipEndDate: data.shipEndDate,
        orderDate: data.orderDate,
        website: '',
        orderStatus: 'Pending',
      },
      items: data.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        currency: data.currency,
        lineTotal: item.lineTotal,
      })),
    })

    const pdfUint8 = await generatePdf(pdfHtml, {
      format: 'Letter',
      landscape: false,
    })
    pdfBuffer = Buffer.from(pdfUint8)
  } catch (error) {
    result.errors.push(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  // Build CC list from config
  const ccList: string[] = []
  if (config.CCEmails) {
    const ccEmails = config.CCEmails.split(',').map(e => e.trim()).filter(Boolean)
    ccList.push(...ccEmails)
  } else if (EMAIL_CC) {
    ccList.push(EMAIL_CC)
  }

  // 1. Send customer confirmation email (if enabled)
  if (config.SendCustomerConfirmation && data.customerEmail) {
    try {
      const customerHtml = customerConfirmationHtml(emailData)
      const subject = isUpdate
        ? `Order ${data.orderNumber} Updated - Order confirmation`
        : `Order ${data.orderNumber} Confirmed - Thank you for your order!`

      await transporter.sendMail({
        from: fromAddress,
        to: data.customerEmail,
        cc: ccList.length > 0 ? ccList.join(',') : undefined,
        subject,
        html: customerHtml,
        attachments: pdfBuffer
          ? [
              {
                filename: `${data.orderNumber}-Confirmation.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
              },
            ]
          : [],
      })

      result.customerEmailSent = true
    } catch (error) {
      result.errors.push(`Customer email failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // 2. Send sales team notification
  const salesEmails = config.SalesTeamEmails || EMAIL_SALES
  if (salesEmails) {
    try {
      const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const adminUrl = `${appUrl}/admin/orders?q=${encodeURIComponent(data.storeName)}`

      const salesHtml = salesNotificationHtml({
        ...emailData,
        adminUrl,
      })

      const subject = isUpdate
        ? `Order ${data.orderNumber} Updated - ${data.storeName}`
        : `New Order ${data.orderNumber} from ${data.storeName}`

      await transporter.sendMail({
        from: fromAddress,
        to: salesEmails,
        subject,
        html: salesHtml,
      })

      result.salesEmailSent = true
    } catch (error) {
      result.errors.push(`Sales email failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Log results for debugging
  if (result.errors.length > 0) {
    console.error('Order email errors:', result.errors)
  } else {
    console.log(`Order emails sent successfully for ${data.orderNumber}${isUpdate ? ' (update)' : ''}`)
  }

  return result
}
