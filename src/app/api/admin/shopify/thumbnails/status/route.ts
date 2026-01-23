import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getLatestThumbnailRun } from '@/lib/data/queries/thumbnails'

/**
 * GET /api/admin/shopify/thumbnails/status
 *
 * Returns current thumbnail generation status for polling.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const latestRun = await getLatestThumbnailRun()

    // Check if run is in progress (started within last 30 minutes)
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
    const inProgress =
      latestRun?.status === 'started' &&
      latestRun.startedAt.getTime() > thirtyMinutesAgo

    return NextResponse.json({
      inProgress,
      lastRun: latestRun
        ? {
            id: latestRun.id.toString(),
            status: latestRun.status,
            startedAt: latestRun.startedAt.toISOString(),
            completedAt: latestRun.completedAt?.toISOString() ?? null,
            currentStep: latestRun.currentStep,
            currentStepDetail: latestRun.currentStepDetail,
            progressPercent: latestRun.progressPercent,
            totalImages: latestRun.totalImages,
            processedCount: latestRun.processedCount,
            skippedCount: latestRun.skippedCount,
            failedCount: latestRun.failedCount,
            enabledSizes: latestRun.enabledSizes
              ? JSON.parse(latestRun.enabledSizes)
              : null,
            errorMessage: latestRun.errorMessage,
          }
        : null,
    })
  } catch (error) {
    console.error('Thumbnail status error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
