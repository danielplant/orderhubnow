/**
 * Sync Settings Restore API
 * ============================================================================
 * POST /api/admin/shopify/settings/restore - Restore settings from history
 */

import { NextResponse } from 'next/server'
import { restoreSyncSettings } from '@/lib/data/actions/settings'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { historyId } = body

    if (!historyId || typeof historyId !== 'number') {
      return NextResponse.json(
        { error: 'Invalid history ID' },
        { status: 400 }
      )
    }

    const result = await restoreSyncSettings(historyId)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({ message: result.message })
  } catch (err) {
    console.error('[POST /api/admin/shopify/settings/restore]', err)
    return NextResponse.json(
      { error: 'Failed to restore settings' },
      { status: 500 }
    )
  }
}
