/**
 * Thumbnail Migration API
 *
 * POST /api/admin/thumbnails/migrate - Run migration
 * GET /api/admin/thumbnails/migrate - Check status
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import {
  migrateLocalThumbnailsToS3,
  checkMigrationStatus
} from '@/lib/utils/thumbnail-migration'

/**
 * GET - Check migration status
 * Returns count of migrated vs old-style thumbnail paths
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = await checkMigrationStatus()

    return NextResponse.json({
      total: status.total,
      migrated: status.migratedCount,
      needsMigration: status.oldStyleCount,
      noThumbnail: status.noThumbnailCount,
      percentComplete: status.total > 0
        ? Math.round((status.migratedCount / status.total) * 100)
        : 100,
    })
  } catch (error) {
    console.error('Migration status check error:', error)
    return NextResponse.json(
      { error: 'Failed to check migration status' },
      { status: 500 }
    )
  }
}

/**
 * POST - Run the migration
 * Migrates all thumbnails from local storage to S3
 * This is idempotent - already migrated SKUs are skipped
 */
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Migration API] Starting thumbnail migration to S3...')

    const result = await migrateLocalThumbnailsToS3((progress) => {
      // Log progress every 100 items
      if (progress.processed % 100 === 0) {
        console.log(`[Migration API] Progress: ${progress.processed}/${progress.total}`)
      }
    })

    console.log('[Migration API] Migration complete:', result.progress)

    return NextResponse.json({
      success: result.success,
      total: result.progress.total,
      migrated: result.progress.migrated,
      skipped: result.progress.skipped,
      failed: result.progress.failed,
      errors: result.errors.slice(0, 10), // First 10 errors only
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
