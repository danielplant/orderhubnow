/**
 * POST /api/orders/[id]/send-emails
 *
 * Sends order confirmation emails based on user preferences from the email modal.
 * Called after order creation when user confirms email settings.
 * No authentication required (public checkout flow).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendOrderEmails } from '@/lib/email/send-order-emails'
import { logActivity, logEmailSent } from '@/lib/audit/activity-logger'
import { getEmailSettings } from '@/lib/data/queries/settings'
import type { OrderEmailPreferences } from '@/lib/types/email'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const orderId = parseInt(id, 10)

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    }

    // Parse preferences from request body
    const body = await request.json()
    const preferences: OrderEmailPreferences = {
      sendCustomer: body.sendCustomer ?? false,
      sendRep: body.sendRep ?? true,
      sendAdmin: body.sendAdmin ?? true,
      additionalCustomerRecipients: body.additionalCustomerRecipients ?? [],
      additionalSalesRecipients: body.additionalSalesRecipients ?? [],
      saveAsRepDefault: body.saveAsRepDefault ?? false,
    }

    // Fetch order details
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        OrderNumber: true,
        StoreName: true,
        BuyerName: true,
        SalesRep: true,
        CustomerEmail: true,
        CustomerPhone: true,
        Country: true,
        OrderAmount: true,
        OrderNotes: true,
        CustomerPO: true,
        ShipStartDate: true,
        ShipEndDate: true,
        OrderDate: true,
        RepID: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Get order items
    const items = await prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
      select: {
        SKU: true,
        Quantity: true,
        Price: true,
      },
    })

    // Determine currency
    const currency: 'USD' | 'CAD' = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'

    // Get rep info
    let repEmail: string | null = null
    if (order.RepID) {
      const rep = await prisma.reps.findUnique({
        where: { ID: order.RepID },
        select: { Email1: true, Email2: true, ID: true },
      })
      repEmail = rep?.Email1 || rep?.Email2 || null

      // Save rep's default preference if requested
      if (preferences.saveAsRepDefault && rep) {
        await prisma.reps.update({
          where: { ID: rep.ID },
          data: { DefaultSendOrderEmail: preferences.sendRep },
        })
      }
    }

    // Get email settings for admin emails
    const emailSettings = await getEmailSettings()

    // Log the email preferences set
    await logActivity({
      entityType: 'order',
      entityId: order.ID.toString(),
      action: 'email_preferences_set',
      description: `Email preferences: Customer=${preferences.sendCustomer}, Rep=${preferences.sendRep}, Admin=${preferences.sendAdmin}`,
      newValues: { ...preferences },
      orderId: order.ID.toString(),
      orderNumber: order.OrderNumber,
    })

    // Build email data
    const emailData = {
      orderId: order.ID.toString(),
      orderNumber: order.OrderNumber,
      storeName: order.StoreName,
      buyerName: order.BuyerName,
      customerEmail: order.CustomerEmail || '',
      customerPhone: order.CustomerPhone || '',
      salesRep: order.SalesRep || '',
      orderAmount: order.OrderAmount,
      currency,
      shipStartDate: order.ShipStartDate || new Date(),
      shipEndDate: order.ShipEndDate || new Date(),
      orderDate: order.OrderDate,
      orderNotes: order.OrderNotes || '',
      customerPO: order.CustomerPO || '',
      items: items.map((item) => ({
        sku: item.SKU,
        quantity: item.Quantity,
        price: item.Price,
        lineTotal: item.Price * item.Quantity,
      })),
    }

    const results = {
      customerEmailSent: false,
      repEmailSent: false,
      adminEmailSent: false,
      errors: [] as string[],
    }

    // Send customer confirmation email if enabled
    if (preferences.sendCustomer && order.CustomerEmail) {
      try {
        const result = await sendOrderEmails(emailData, false)
        results.customerEmailSent = result.customerEmailSent

        if (result.customerEmailSent) {
          await logEmailSent({
            entityType: 'order',
            entityId: order.ID.toString(),
            orderId: order.ID.toString(),
            orderNumber: order.OrderNumber,
            emailType: 'order_confirmation',
            recipient: order.CustomerEmail,
            performedBy: 'Buyer',
          })
        }

        if (result.errors.length > 0) {
          results.errors.push(...result.errors)
        }
      } catch (err) {
        results.errors.push(`Customer email failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    // Send rep notification if enabled - actually send email to rep
    if (preferences.sendRep && repEmail) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'send-emails/route.ts:repEmail:start',message:'Starting rep email send',data:{repEmail,orderId:order.ID.toString(),orderNumber:order.OrderNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2-rep-email'})}).catch(()=>{});
      // #endregion
      try {
        // Send to rep by temporarily overriding the sales team emails
        const repEmailData = {
          ...emailData,
          // Override to send specifically to the rep
        }
        
        // Use sendMailWithConfig to send directly to rep
        const { sendMailWithConfig } = await import('@/lib/email/client')
        const { salesNotificationHtml } = await import('@/lib/email/templates')
        
        const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
        const adminUrl = `${appUrl}/admin/orders?q=${encodeURIComponent(order.StoreName)}`
        
        const repHtml = salesNotificationHtml({
          orderNumber: order.OrderNumber,
          storeName: order.StoreName,
          buyerName: order.BuyerName,
          customerEmail: order.CustomerEmail || '',
          customerPhone: order.CustomerPhone || '',
          salesRep: order.SalesRep || '',
          orderAmount: order.OrderAmount,
          currency,
          shipStartDate: order.ShipStartDate ? new Date(order.ShipStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
          shipEndDate: order.ShipEndDate ? new Date(order.ShipEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
          orderDate: order.OrderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          orderNotes: order.OrderNotes || '',
          customerPO: order.CustomerPO || '',
          items: emailData.items,
          adminUrl,
        })
        
        const fromEmail = emailSettings.FromEmail || 'orders@limeapple.com'
        const fromAddress = emailSettings.FromName ? `"${emailSettings.FromName}" <${fromEmail}>` : fromEmail
        
        await sendMailWithConfig(emailSettings, {
          from: fromAddress,
          to: repEmail,
          subject: `New Order ${order.OrderNumber} from ${order.StoreName}`,
          html: repHtml,
        })
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'send-emails/route.ts:repEmail:success',message:'Rep email sent successfully',data:{repEmail,fromAddress},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2-rep-email'})}).catch(()=>{});
        // #endregion
        
        results.repEmailSent = true
        
        await logEmailSent({
          entityType: 'order',
          entityId: order.ID.toString(),
          orderId: order.ID.toString(),
          orderNumber: order.OrderNumber,
          emailType: 'rep_notification',
          recipient: repEmail,
          performedBy: 'Buyer',
        })
      } catch (err) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'send-emails/route.ts:repEmail:error',message:'Rep email failed',data:{error:err instanceof Error ? err.message : 'Unknown',repEmail},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2-rep-email'})}).catch(()=>{});
        // #endregion
        results.errors.push(`Rep email failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    // Send admin notification if enabled
    if (preferences.sendAdmin && emailSettings.SalesTeamEmails) {
      try {
        const result = await sendOrderEmails(emailData, false)
        results.adminEmailSent = result.salesEmailSent

        if (result.salesEmailSent) {
          await logEmailSent({
            entityType: 'order',
            entityId: order.ID.toString(),
            orderId: order.ID.toString(),
            orderNumber: order.OrderNumber,
            emailType: 'sales_notification',
            recipient: emailSettings.SalesTeamEmails,
            performedBy: 'Buyer',
          })
        }

        if (result.errors.length > 0) {
          results.errors.push(...result.errors)
        }
      } catch (err) {
        results.errors.push(`Admin email failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error('POST /api/orders/[id]/send-emails error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
