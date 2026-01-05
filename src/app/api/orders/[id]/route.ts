import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getOrderById } from '@/lib/data/queries/orders'
import { updateOrder, updateOrderStatus, updateOrderRep } from '@/lib/data/actions/orders'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/orders/[id]
 * Get single order details.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const order = await getOrderById(id)
    
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    
    return NextResponse.json(order)
  } catch (error) {
    console.error('GET /api/orders/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/orders/[id]
 * Update order. Supports:
 * - Status-only update: { status: "Shipped" }
 * - Rep-only update: { salesRep: "John" }
 * - Full update (items, header): full UpdateOrderInput body
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    
    // Status-only update (uses newStatus per action signature)
    if (body.status && Object.keys(body).length === 1) {
      const result = await updateOrderStatus({
        orderId: id,
        newStatus: body.status,
      })
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }
    
    // Rep-only update (uses repName per action signature)
    if (body.salesRep && Object.keys(body).length === 1) {
      const result = await updateOrderRep({
        orderId: id,
        repName: body.salesRep,
      })
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }
    
    // Full update - adapt body to match UpdateOrderInput signature
    const result = await updateOrder({
      orderId: id,
      ...body,
    })
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({ success: true, orderNumber: result.orderNumber })
  } catch (error) {
    console.error('PATCH /api/orders/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    )
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Use POST /api/orders to create orders' },
    { status: 400 }
  )
}

export async function DELETE() {
  // Orders are never deleted in .NET - only status changed to Cancelled
  return NextResponse.json(
    { error: 'Orders cannot be deleted. Set status to Cancelled instead.' },
    { status: 400 }
  )
}
