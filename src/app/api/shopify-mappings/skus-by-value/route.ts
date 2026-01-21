/**
 * GET /api/shopify-mappings/skus-by-value
 *
 * Returns raw SKUs from RawSkusFromShopify that match a specific raw collection value.
 * Used by the mapping preview page to show which SKUs are affected by an unmapped value.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getRawSkusByCollectionValue } from '@/lib/data/queries/collections'

export async function GET(request: NextRequest) {
  // Require admin authentication
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const rawValue = searchParams.get('rawValue')

    if (!rawValue) {
      return NextResponse.json(
        { error: 'rawValue query parameter is required' },
        { status: 400 }
      )
    }

    // Parse pagination params
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize')) || 50))
    const offset = (page - 1) * pageSize

    const { skus, total } = await getRawSkusByCollectionValue(rawValue, pageSize, offset)

    return NextResponse.json({
      skus,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('Error fetching raw SKUs by collection value:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
