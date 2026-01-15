import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/orders/[id]/exists
 *
 * Lightweight check to validate if an order exists and is editable.
 * Used to validate stale localStorage edit state on app mount.
 *
 * No auth required - only returns existence/editable status, no order data.
 *
 * Returns:
 * - 200 with { exists: true, editable: true } if order exists and is editable
 * - 200 with { exists: true, editable: false } if order exists but not editable
 * - 404 with { exists: false, editable: false } if order doesn't exist
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Validate ID is a valid number
    const orderId = parseInt(id, 10)
    if (isNaN(orderId)) {
      return NextResponse.json(
        { exists: false, editable: false },
        { status: 404 }
      )
    }

    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        OrderStatus: true,
      },
    })

    if (!order) {
      return NextResponse.json(
        { exists: false, editable: false },
        { status: 404 }
      )
    }

    // Only Draft and Pending orders are editable
    const editableStatuses = ['Draft', 'Pending']
    const isEditable = editableStatuses.includes(order.OrderStatus || '')

    return NextResponse.json({
      exists: true,
      editable: isEditable,
    })
  } catch (error) {
    console.error('GET /api/orders/[id]/exists error:', error)
    return NextResponse.json(
      { exists: false, editable: false, error: 'Failed to check order' },
      { status: 500 }
    )
  }
}
