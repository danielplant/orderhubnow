import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getCalculatedFields } from '@/lib/data/queries/calculated-fields'
import { createCalculatedField, type CreateCalculatedFieldInput } from '@/lib/data/actions/calculated-fields'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fields = await getCalculatedFields()

  return NextResponse.json({ fields })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as CreateCalculatedFieldInput

    if (!body.name || !body.formula) {
      return NextResponse.json({ error: 'Name and formula are required' }, { status: 400 })
    }

    const result = await createCalculatedField(body)

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to create' }, { status: 400 })
    }

    return NextResponse.json({ success: true, id: result.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create calculated field' },
      { status: 500 }
    )
  }
}
