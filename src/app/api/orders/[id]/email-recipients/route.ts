/**
 * GET /api/orders/[id]/email-recipients
 *
 * Returns computed email recipient information for the order confirmation popup.
 * Fetches from order data, rep profile, and email settings.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmailSettings } from '@/lib/data/queries/settings'
import type { EmailRecipientInfo } from '@/lib/types/email'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const orderId = parseInt(id, 10)

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    }

    // Fetch order with rep info
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        CustomerEmail: true,
        RepID: true,
        SalesRep: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Fetch rep info if RepID exists
    let repEmail: string | null = null
    let repName: string | null = order.SalesRep || null
    let repDefaultSendEmail = true

    if (order.RepID) {
      const rep = await prisma.reps.findUnique({
        where: { ID: order.RepID },
        select: {
          Email1: true,
          Name: true,
          DefaultSendOrderEmail: true,
        },
      })

      if (rep) {
        repEmail = rep.Email1 || null
        repName = rep.Name || repName
        repDefaultSendEmail = rep.DefaultSendOrderEmail ?? true
      }
    }

    // Fetch email settings
    const emailSettings = await getEmailSettings()

    // Parse admin emails from SalesTeamEmails
    const adminEmails: string[] = emailSettings.SalesTeamEmails
      ? emailSettings.SalesTeamEmails.split(',').map(e => e.trim()).filter(Boolean)
      : []

    // Parse CC emails
    const ccEmails: string[] = emailSettings.CCEmails
      ? emailSettings.CCEmails.split(',').map(e => e.trim()).filter(Boolean)
      : []

    const result: EmailRecipientInfo = {
      customerEmail: order.CustomerEmail || null,
      repEmail,
      repName,
      adminEmails,
      ccEmails,
      repDefaultSendEmail,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/orders/[id]/email-recipients error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch email recipients' },
      { status: 500 }
    )
  }
}
