import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getOrders } from '@/lib/data/queries/orders'
import { createOrder } from '@/lib/data/actions/orders'

/**
 * GET /api/orders
 * List orders with filtering, sorting, pagination.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = Object.fromEntries(
      request.nextUrl.searchParams.entries()
    )
    
    const result = await getOrders(searchParams)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/orders error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/orders
 * Create a new order.
 * Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate required fields
    const required = ['buyerName', 'storeName', 'salesRepId', 'customerEmail', 'currency', 'items']
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }
    
    const result = await createOrder(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { success: true, orderNumber: result.orderNumber, orderId: result.orderId },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/orders error:', error)
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    )
  }
}

// PATCH and DELETE should be on /api/orders/[id]/route.ts
export async function PATCH() {
  return NextResponse.json(
    { error: 'Use /api/orders/[id] for updates' },
    { status: 400 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Use /api/orders/[id] for deletion' },
    { status: 400 }
  )
}
