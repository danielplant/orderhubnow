import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getRepById } from '@/lib/data/queries/reps'
import { updateRep, deleteRep } from '@/lib/data/actions/reps'

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
    const repId = parseInt(id, 10)
    
    if (isNaN(repId)) {
      return NextResponse.json({ error: 'Invalid rep ID' }, { status: 400 })
    }
    
    const rep = await getRepById(repId)
    
    if (!rep) {
      return NextResponse.json({ error: 'Rep not found' }, { status: 404 })
    }
    
    return NextResponse.json(rep)
  } catch (error) {
    console.error('GET /api/reps/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch rep' }, { status: 500 })
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
    
    const result = await updateRep(id, body)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/reps/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update rep' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const result = await deleteRep(id)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/reps/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete rep' }, { status: 500 })
  }
}
