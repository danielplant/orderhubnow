import { NextResponse } from 'next/server'
import { cleanupOrphanedRuns } from '@/lib/shopify/sync'

/**
 * Cron endpoint to clean up stale sync runs.
 *
 * This endpoint should be called periodically (e.g., every 5 minutes) to:
 * - Detect sync processes that died mid-execution (no heartbeat for 5+ min)
 * - Mark them as 'timeout' so new syncs can be started
 *
 * Security: This endpoint is public but only performs cleanup operations.
 * For production, consider adding a secret token check.
 *
 * Example cron setup (crontab):
 *   *\/5 * * * * curl -X POST https://yourdomain.com/api/cron/sync-cleanup
 *
 * Example AWS CloudWatch Events rule:
 *   rate(5 minutes) → Lambda → POST to this endpoint
 */
export async function POST(request: Request) {
  // Optional: Check for cron secret to prevent abuse
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const cleanedUp = await cleanupOrphanedRuns()

    return NextResponse.json({
      success: true,
      cleanedUp,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Sync cleanup cron error:', err)
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
