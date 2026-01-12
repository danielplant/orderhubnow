/**
 * API route for getting product details by base SKU
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getProductByBaseSku } from '@/lib/data/queries/products'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ baseSku: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { baseSku } = await params
    const product = await getProductByBaseSku(decodeURIComponent(baseSku))

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}
