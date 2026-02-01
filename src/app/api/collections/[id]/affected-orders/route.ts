import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getAffectedOrdersByWindowChange } from '@/lib/data/queries/collections'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  return session
}

/**
 * GET /api/collections/[id]/affected-orders?newStart=YYYY-MM-DD&newEnd=YYYY-MM-DD
 *
 * Returns orders/shipments that would be affected by changing the collection's
 * ship window to the specified new dates.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const newStart = searchParams.get('newStart')
    const newEnd = searchParams.get('newEnd')

    if (!newStart || !newEnd) {
      return NextResponse.json(
        { error: 'newStart and newEnd query parameters are required' },
        { status: 400 }
      )
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(newStart) || !dateRegex.test(newEnd)) {
      return NextResponse.json(
        { error: 'Dates must be in YYYY-MM-DD format' },
        { status: 400 }
      )
    }

    const collectionId = parseInt(id, 10)
    if (isNaN(collectionId)) {
      return NextResponse.json(
        { error: 'Invalid collection ID' },
        { status: 400 }
      )
    }

    const result = await getAffectedOrdersByWindowChange(
      collectionId,
      newStart,
      newEnd
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to get affected orders:', error)
    return NextResponse.json(
      { error: 'Failed to get affected orders' },
      { status: 500 }
    )
  }
}
