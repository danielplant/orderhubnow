/**
 * Sync Settings History API
 * ============================================================================
 * GET /api/admin/shopify/settings/history - Fetch settings history
 */

import { NextResponse } from 'next/server'
import { getSyncSettingsHistory } from '@/lib/data/queries/settings'

export async function GET() {
  try {
    const history = await getSyncSettingsHistory(20)
    return NextResponse.json({ history })
  } catch (err) {
    console.error('[GET /api/admin/shopify/settings/history]', err)
    return NextResponse.json(
      { error: 'Failed to fetch settings history' },
      { status: 500 }
    )
  }
}
