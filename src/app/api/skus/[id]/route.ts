import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getSkuById } from '@/lib/data/queries/products'
import { updateSku, deleteSku } from '@/lib/data/actions/products'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const sku = await getSkuById(id)
    
    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }
    
    return NextResponse.json(sku)
  } catch (error) {
    console.error('GET /api/skus/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch SKU' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    
    const result = await updateSku(id, body)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/skus/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update SKU' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const result = await deleteSku(id)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/skus/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete SKU' }, { status: 500 })
  }
}
