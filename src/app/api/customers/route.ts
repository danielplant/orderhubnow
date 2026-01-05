import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getCustomers } from '@/lib/data/queries/customers'
import { createCustomer } from '@/lib/data/actions/customers'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const input = {
      search: searchParams.get('search') ?? undefined,
      page: parseInt(searchParams.get('page') ?? '1', 10) || 1,
      pageSize: parseInt(searchParams.get('pageSize') ?? '20', 10) || 20,
    }
    
    const result = await getCustomers(input)
    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/customers error:', error)
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    if (!body.storeName?.trim()) {
      return NextResponse.json({ error: 'Store name is required' }, { status: 400 })
    }
    
    const result = await createCustomer(body)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error) {
    console.error('POST /api/customers error:', error)
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}

export async function PATCH() {
  return NextResponse.json({ error: 'Use /api/customers/[id]' }, { status: 400 })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Use /api/customers/[id]' }, { status: 400 })
}
