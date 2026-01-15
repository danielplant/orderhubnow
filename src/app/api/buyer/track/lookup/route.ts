/**
 * Order Tracking Lookup API
 * 
 * POST /api/buyer/track/lookup
 * Looks up an order by order number and email, returns tracking URL
 */

import { NextRequest, NextResponse } from 'next/server'
import { findOrderByNumberAndEmail } from '@/lib/data/queries/order-tracking'
import { generateTrackingToken } from '@/lib/tokens/order-tracking'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderNumber, email } = body

    if (!orderNumber || !email) {
      return NextResponse.json(
        { success: false, error: 'Order number and email are required' },
        { status: 400 }
      )
    }

    // Look up order
    const result = await findOrderByNumberAndEmail(orderNumber, email)

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Order not found. Please check your order number and email address.' },
        { status: 404 }
      )
    }

    // Generate tracking token and URL
    const token = generateTrackingToken(result.orderId, email)
    const trackingUrl = `/buyer/track/${token}`

    return NextResponse.json({
      success: true,
      trackingUrl,
    })
  } catch (error) {
    console.error('Order lookup error:', error)
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
