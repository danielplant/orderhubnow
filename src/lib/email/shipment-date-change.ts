/**
 * Email template for shipment date change notifications.
 * Sent when collection window changes affect existing orders.
 */

import { sendMailWithConfig } from './client'
import { getEmailSettings, getCompanySettings } from '@/lib/data/queries/settings'

interface DateChangeEmailData {
  to: string
  recipientName: string
  orderNumber: string
  orderId: string
  storeName: string
  collectionName: string
  oldStart: string
  oldEnd: string
  newStart: string
  newEnd: string
  isRep: boolean
}

/**
 * Send email notification about shipment date change.
 */
export async function sendDateChangeEmail(
  data: DateChangeEmailData
): Promise<void> {
  const emailConfig = await getEmailSettings()
  const companySettings = await getCompanySettings()
  const appName = companySettings?.CompanyName || 'OrderHubNow'

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'https://app.orderhubnow.com'
  const orderUrl = `${baseUrl}/admin/orders/${data.orderId}`

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

  const subject = `Ship Date Update for Order ${data.orderNumber}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1a1a1a; margin-bottom: 20px;">Ship Date Update</h2>
  
  <p>Dear ${data.recipientName},</p>
  
  <p>The ship window for ${data.isRep ? "your customer's order" : 'your order'} has been updated:</p>
  
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 8px 0; color: #666;">Order Number:</td>
      <td style="padding: 8px 0; font-weight: bold;">${data.orderNumber}</td>
    </tr>
    ${
      data.storeName
        ? `
    <tr>
      <td style="padding: 8px 0; color: #666;">Store:</td>
      <td style="padding: 8px 0;">${data.storeName}</td>
    </tr>
    `
        : ''
    }
    <tr>
      <td style="padding: 8px 0; color: #666;">Collection:</td>
      <td style="padding: 8px 0;">${data.collectionName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #666;">Previous Dates:</td>
      <td style="padding: 8px 0; text-decoration: line-through; color: #999;">
        ${formatDate(data.oldStart)} - ${formatDate(data.oldEnd)}
      </td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #666;">New Dates:</td>
      <td style="padding: 8px 0; font-weight: bold; color: #2563eb;">
        ${formatDate(data.newStart)} - ${formatDate(data.newEnd)}
      </td>
    </tr>
  </table>
  
  <p>This change was made to align with the updated collection ship window.</p>
  
  <p style="margin: 24px 0;">
    <a href="${orderUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
      View Order Details
    </a>
  </p>
  
  <p>If you have any questions, please contact us.</p>
  
  <p style="margin-top: 30px; color: #666;">
    Best regards,<br>
    The ${appName} Team
  </p>
</body>
</html>
`

  await sendMailWithConfig(emailConfig, {
    from: emailConfig.FromEmail || 'noreply@orderhubnow.com',
    to: data.to,
    subject,
    html,
  })
}
