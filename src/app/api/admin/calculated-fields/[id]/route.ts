import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getCalculatedFieldById } from '@/lib/data/queries/calculated-fields'
import { 
  updateCalculatedField, 
  deleteCalculatedField,
  type UpdateCalculatedFieldInput 
} from '@/lib/data/actions/calculated-fields'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const fieldId = parseInt(id, 10)
  
  if (isNaN(fieldId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const field = await getCalculatedFieldById(fieldId)

  if (!field) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ field })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const fieldId = parseInt(id, 10)
  
  if (isNaN(fieldId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    const body = (await request.json()) as UpdateCalculatedFieldInput

    const result = await updateCalculatedField(fieldId, body)

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to update' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update calculated field' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const fieldId = parseInt(id, 10)
  
  if (isNaN(fieldId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    const result = await deleteCalculatedField(fieldId)

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to delete' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete calculated field' },
      { status: 500 }
    )
  }
}
