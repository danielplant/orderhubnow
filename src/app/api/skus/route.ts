import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getProducts } from '@/lib/data/queries/products'
import { getSkusByCategory } from '@/lib/data/queries/skus'
import { createSku } from '@/lib/data/actions/products'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const categoryId = searchParams.get('categoryId')
    
    // If categoryId provided, use getSkusByCategory for grouped product view
    if (categoryId) {
      const catId = parseInt(categoryId, 10)
      if (isNaN(catId)) {
        return NextResponse.json({ error: 'Invalid categoryId' }, { status: 400 })
      }
      const result = await getSkusByCategory(catId)
      return NextResponse.json(result)
    }
    
    // Otherwise use getProducts for paginated list
    const params = Object.fromEntries(searchParams.entries())
    const result = await getProducts(params)
    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/skus error:', error)
    return NextResponse.json({ error: 'Failed to fetch SKUs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    if (!body.skuId?.trim()) {
      return NextResponse.json({ error: 'SKU ID is required' }, { status: 400 })
    }
    
    const result = await createSku(body)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error) {
    console.error('POST /api/skus error:', error)
    return NextResponse.json({ error: 'Failed to create SKU' }, { status: 500 })
  }
}

export async function PATCH() {
  return NextResponse.json({ error: 'Use /api/skus/[id]' }, { status: 400 })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Use /api/skus/[id]' }, { status: 400 })
}
