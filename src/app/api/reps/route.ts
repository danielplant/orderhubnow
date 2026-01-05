import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getReps } from '@/lib/data/queries/reps'
import { createRep } from '@/lib/data/actions/reps'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const result = await getReps()
    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/reps error:', error)
    return NextResponse.json({ error: 'Failed to fetch reps' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!body.code?.trim()) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 })
    }
    if (!body.email1?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    
    const result = await createRep(body)
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json(
      { success: true, id: result.id, inviteUrl: result.inviteUrl },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/reps error:', error)
    return NextResponse.json({ error: 'Failed to create rep' }, { status: 500 })
  }
}

export async function PATCH() {
  return NextResponse.json({ error: 'Use /api/reps/[id]' }, { status: 400 })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Use /api/reps/[id]' }, { status: 400 })
}
