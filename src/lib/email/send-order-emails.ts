/**
 * Order Email Service
 *
 * Sends order confirmation emails via SMTP.
 * Matches .NET EmailsProcessing.SendEmail() behavior.
 */

import { sendMailWithConfig } from './client'
import { customerConfirmationHtml, salesNotificationHtml, PlannedShipmentForEmail } from './templates'
import { generatePdf } from '@/lib/pdf/generate'
import { generateOrderConfirmationHtml } from '@/lib/pdf/order-confirmation'
import { getEmailSettings, getCompanySettings } from '@/lib/data/queries/settings'
import { logEmailSent, logEmailResult } from '@/lib/audit/activity-logger'
import { prisma } from '@/lib/prisma'
import type { EmailSettingsRecord } from '@/lib/types/settings'

interface OrderEmailData {
  orderId: string
  orderNumber: string
  storeName: string
  buyerName: string
  customerEmail: string
  customerPhone: string
  salesRep: string
  salesRepEmail?: string
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
  repEmailSent: boolean
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
 * Get email configuration from database.
 * Throws if DB query fails - no ENV fallback.
 */
async function getEmailConfig(): Promise<EmailSettingsRecord> {
  return await getEmailSettings()
}

export async function sendOrderEmails(data: OrderEmailData, isUpdate = false): Promise<SendOrderEmailsResult> {
  const result: SendOrderEmailsResult = {
    customerEmailSent: false,
    repEmailSent: false,
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

  // Phase 9: Fetch planned shipments for grouped email rendering
  let shipmentsForEmail: PlannedShipmentForEmail[] = []
  try {
    const plannedShipments = await prisma.plannedShipment.findMany({
      where: { CustomerOrderID: BigInt(data.orderId) },
      select: {
        ID: true,
        CollectionName: true,
        PlannedShipStart: true,
        PlannedShipEnd: true,
        Items: {
          select: {
            SKU: true,
            Quantity: true,
            Price: true,
          },
        },
      },
      orderBy: { PlannedShipStart: 'asc' },
    })

    shipmentsForEmail = plannedShipments.map((s) => ({
      id: String(s.ID),
      collectionName: s.CollectionName,
      plannedShipStart: formatDate(s.PlannedShipStart),
      plannedShipEnd: formatDate(s.PlannedShipEnd),
      items: s.Items.map((i) => ({
        sku: i.SKU,
        quantity: i.Quantity,
        price: i.Price,
        lineTotal: i.Price * i.Quantity,
      })),
      subtotal: s.Items.reduce((sum, i) => sum + i.Price * i.Quantity, 0),
    }))
  } catch (err) {
    console.error('Failed to fetch planned shipments for email:', err)
    // Continue with empty array - will render flat format (graceful degradation)
  }

  // Determine from address (DB only)
  if (!config.FromEmail) {
    result.errors.push('From email not configured. Set in Admin → Settings → Email.')
    return result
  }
  const fromEmail = config.FromEmail
  const fromAddress = config.FromName ? `"${config.FromName}" <${fromEmail}>` : fromEmail

  // Generate PDF attachment
  let pdfBuffer: Buffer | null = null
  try {
    // Calculate subtotal from items
    const subtotal = data.items.reduce((sum, item) => sum + item.lineTotal, 0)

    // Fetch company settings for PDF branding
    const companySettings = await getCompanySettings()

    // Gap 1 Fix: Build planned shipments for PDF (needs Date objects, not strings)
    interface PlannedShipmentForPdf {
      id: string
      collectionName: string | null
      plannedShipStart: Date
      plannedShipEnd: Date
      items: Array<{
        sku: string
        quantity: number
        price: number
        currency: string
        lineTotal: number
        discount: number
      }>
      subtotal: number
    }

    let shipmentsForPdf: PlannedShipmentForPdf[] = []
    if (shipmentsForEmail.length > 0) {
      // Re-fetch with Date objects for PDF (email uses formatted strings)
      try {
        const plannedShipmentsForPdf = await prisma.plannedShipment.findMany({
          where: { CustomerOrderID: BigInt(data.orderId) },
          select: {
            ID: true,
            CollectionName: true,
            PlannedShipStart: true,
            PlannedShipEnd: true,
            Items: {
              select: {
                SKU: true,
                Quantity: true,
                Price: true,
              },
            },
          },
          orderBy: { PlannedShipStart: 'asc' },
        })

        shipmentsForPdf = plannedShipmentsForPdf.map((s) => ({
          id: String(s.ID),
          collectionName: s.CollectionName,
          plannedShipStart: s.PlannedShipStart,
          plannedShipEnd: s.PlannedShipEnd,
          items: s.Items.map((i) => ({
            sku: i.SKU,
            quantity: i.Quantity,
            price: i.Price,
            currency: data.currency,
            lineTotal: i.Price * i.Quantity,
            discount: 0,
          })),
          subtotal: s.Items.reduce((sum, i) => sum + i.Price * i.Quantity, 0),
        }))
      } catch (err) {
        console.error('Failed to fetch planned shipments for PDF attachment:', err)
        // Continue without grouping - PDF will render flat format
      }
    }

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
        // New required fields (use defaults for email context)
        shipToAddress: null,
        billToAddress: null,
        subtotal: subtotal,
        totalDiscount: 0,
      },
      items: data.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        currency: data.currency,
        lineTotal: item.lineTotal,
        discount: 0,
      })),
      // Gap 1 Fix: Pass planned shipments for grouped PDF rendering
      plannedShipments: shipmentsForPdf.length > 0 ? shipmentsForPdf : undefined,
      company: {
        companyName: companySettings.CompanyName,
        logoUrl: companySettings.LogoUrl,
        phone: companySettings.Phone,
        email: companySettings.Email,
        website: companySettings.Website,
      },
    })

    const pdfUint8 = await generatePdf(pdfHtml, {
      format: 'Letter',
      landscape: false,
    })
    pdfBuffer = Buffer.from(pdfUint8)
  } catch (error) {
    result.errors.push(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  // Build CC list from config (DB only)
  const ccList: string[] = []
  if (config.CCEmails) {
    const ccEmails = config.CCEmails.split(',').map(e => e.trim()).filter(Boolean)
    ccList.push(...ccEmails)
  }

  // 1. Send customer confirmation email (if enabled)
  if (config.SendCustomerConfirmation && data.customerEmail) {
    try {
      // Phase 9: Pass shipments for grouped rendering
      const customerHtml = customerConfirmationHtml(emailData, shipmentsForEmail.length > 0 ? shipmentsForEmail : undefined)
      const subject = isUpdate
        ? `Order ${data.orderNumber} Updated - Order confirmation`
        : `Order ${data.orderNumber} Confirmed - Thank you for your order!`

      await sendMailWithConfig(config, {
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

      // Log the email send (non-blocking)
      logEmailSent({
        entityType: 'order',
        entityId: data.orderId,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        emailType: isUpdate ? 'order_update' : 'order_confirmation',
        recipient: data.customerEmail,
      }).catch((err) => console.error('Failed to log customer email:', err))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`Customer email failed: ${errorMessage}`)

      // Log the failed send (non-blocking)
      logEmailResult({
        entityType: 'order',
        entityId: data.orderId,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        emailType: isUpdate ? 'order_update' : 'order_confirmation',
        recipient: data.customerEmail,
        status: 'failed',
        errorMessage,
      }).catch((err) => console.error('Failed to log customer email failure:', err))
    }
  }

  // 2. Send rep order copy (if enabled and rep email provided)
  if (config.SendRepOrderCopy && data.salesRepEmail) {
    try {
      // Phase 9: Pass shipments for grouped rendering (rep copy)
      const customerHtml = customerConfirmationHtml(emailData, shipmentsForEmail.length > 0 ? shipmentsForEmail : undefined)
      const subject = isUpdate
        ? `[REP COPY] Order ${data.orderNumber} Updated - ${data.storeName}`
        : `[REP COPY] Order ${data.orderNumber} - ${data.storeName}`

      await sendMailWithConfig(config, {
        from: fromAddress,
        to: data.salesRepEmail,
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

      result.repEmailSent = true

      // Log the email send (non-blocking)
      logEmailSent({
        entityType: 'order',
        entityId: data.orderId,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        emailType: isUpdate ? 'order_update' : 'order_confirmation',
        recipient: data.salesRepEmail,
      }).catch((err) => console.error('Failed to log rep copy email:', err))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`Rep copy email failed: ${errorMessage}`)

      // Log the failed send (non-blocking)
      logEmailResult({
        entityType: 'order',
        entityId: data.orderId,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        emailType: isUpdate ? 'order_update' : 'order_confirmation',
        recipient: data.salesRepEmail,
        status: 'failed',
        errorMessage,
      }).catch((err) => console.error('Failed to log rep copy email failure:', err))
    }
  } else if (data.salesRepEmail && !config.SendRepOrderCopy) {
    // Log skipped email
    logEmailResult({
      entityType: 'order',
      entityId: data.orderId,
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      emailType: isUpdate ? 'order_update' : 'order_confirmation',
      recipient: data.salesRepEmail,
      status: 'skipped',
      skipReason: 'Rep order copy emails disabled in settings',
    }).catch((err) => console.error('Failed to log rep copy skip:', err))
  }

  // 3. Send sales team notification (DB only)
  const salesEmails = config.SalesTeamEmails
  if (salesEmails) {
    try {
      const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const adminUrl = `${appUrl}/admin/orders?q=${encodeURIComponent(data.storeName)}`

      // Phase 9: Pass shipments for grouped rendering (sales team)
      const salesHtml = salesNotificationHtml({
        ...emailData,
        adminUrl,
      }, shipmentsForEmail.length > 0 ? shipmentsForEmail : undefined)

      const subject = isUpdate
        ? `Order ${data.orderNumber} Updated - ${data.storeName}`
        : `New Order ${data.orderNumber} from ${data.storeName}`

      await sendMailWithConfig(config, {
        from: fromAddress,
        to: salesEmails,
        subject,
        html: salesHtml,
      })

      result.salesEmailSent = true

      // Log the email send (non-blocking)
      logEmailSent({
        entityType: 'order',
        entityId: data.orderId,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        emailType: 'sales_notification',
        recipient: salesEmails,
      }).catch((err) => console.error('Failed to log sales email:', err))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`Sales email failed: ${errorMessage}`)

      // Log the failed send (non-blocking)
      logEmailResult({
        entityType: 'order',
        entityId: data.orderId,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        emailType: 'sales_notification',
        recipient: salesEmails,
        status: 'failed',
        errorMessage,
      }).catch((err) => console.error('Failed to log sales email failure:', err))
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
