import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getAvailabilitySettingsWithMeta } from '@/lib/data/queries/availability-settings'
import { updateAvailabilitySettings } from '@/lib/data/actions/availability-settings'
import type { AvailabilitySettingsRecord } from '@/lib/types/availability-settings'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { settings, updatedAt, updatedBy } = await getAvailabilitySettingsWithMeta()

  return NextResponse.json({
    settings,
    updatedAt,
    updatedBy,
  })
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as AvailabilitySettingsRecord
    const result = await updateAvailabilitySettings(body, session.user.id)

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to update' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update availability settings' },
      { status: 500 }
    )
  }
}
