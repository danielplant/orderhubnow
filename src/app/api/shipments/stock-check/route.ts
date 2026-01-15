/**
 * Stock Check API
 * 
 * POST /api/shipments/stock-check
 * Returns stock warnings for items being shipped.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getStockWarnings } from '@/lib/data/queries/inventory-check'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      )
    }

    const result = await getStockWarnings(items)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Stock check error:', error)
    return NextResponse.json(
      { error: 'Failed to check stock levels' },
      { status: 500 }
    )
  }
}
