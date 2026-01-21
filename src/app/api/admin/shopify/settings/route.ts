/**
 * Sync Settings API
 * ============================================================================
 * GET /api/admin/shopify/settings - Fetch current settings
 * PUT /api/admin/shopify/settings - Update settings
 */

import { NextResponse } from 'next/server'
import { getSyncSettings } from '@/lib/data/queries/settings'
import { updateSyncSettings } from '@/lib/data/actions/settings'

export async function GET() {
  try {
    const settings = await getSyncSettings()
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[GET /api/admin/shopify/settings]', err)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()

    // Extract editable fields (exclude id, version, updatedAt)
    const {
      thumbnailSettingsVersion,
      thumbnailSizeSm,
      thumbnailSizeMd,
      thumbnailSizeLg,
      thumbnailQuality,
      thumbnailFit,
      thumbnailBackground,
      thumbnailFetchTimeoutMs,
      thumbnailBatchConcurrency,
      thumbnailEnabled,
      backupEnabled,
      backupRetentionDays,
      cleanupStaleBackups,
      syncMaxWaitMs,
      syncPollIntervalMs,
    } = body

    const result = await updateSyncSettings({
      thumbnailSettingsVersion,
      thumbnailSizeSm,
      thumbnailSizeMd,
      thumbnailSizeLg,
      thumbnailQuality,
      thumbnailFit,
      thumbnailBackground,
      thumbnailFetchTimeoutMs,
      thumbnailBatchConcurrency,
      thumbnailEnabled,
      backupEnabled,
      backupRetentionDays,
      cleanupStaleBackups,
      syncMaxWaitMs,
      syncPollIntervalMs,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    const settings = await getSyncSettings()
    return NextResponse.json({ settings, message: result.message })
  } catch (err) {
    console.error('[PUT /api/admin/shopify/settings]', err)
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
