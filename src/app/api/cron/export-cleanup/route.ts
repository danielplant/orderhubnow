import { NextResponse } from 'next/server'
import { cleanupExpiredExports, getCleanupStats } from '@/lib/sync-service/services'

/**
 * Cron endpoint to clean up expired export files from S3.
 *
 * This endpoint should be called daily to:
 * - Delete exports that have passed their expiration time (24h default)
 * - Update database records to mark them as 'expired'
 * - Free up S3 storage
 *
 * Security: Requires CRON_SECRET in production.
 *
 * Example cron setup:
 *   0 3 * * * curl https://yourdomain.com/api/cron/export-cleanup -H "Authorization: Bearer $CRON_SECRET"
 *
 * Phase 3: Durable Background Jobs
 */
export async function POST(request: Request) {
  // Check for cron secret in production
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const result = await cleanupExpiredExports()
    const stats = await getCleanupStats()

    // Structured logging for monitoring
    console.log(
      JSON.stringify({
        event: 'cron_export_cleanup',
        timestamp: new Date().toISOString(),
        deleted: result.deleted,
        errors: result.errors,
        durationMs: Date.now() - startTime,
      })
    )

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      errors: result.errors,
      errorDetails: result.errors > 0 ? result.errorDetails : undefined,
      stats,
      durationMs: Date.now() - startTime,
    })
  } catch (err) {
    console.error('[export-cleanup] Cron error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cleanup failed' },
      { status: 500 }
    )
  }
}

// Also support GET for easy manual testing
export async function GET(request: Request) {
  return POST(request)
}
