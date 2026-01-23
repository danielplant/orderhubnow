/**
 * Thumbnail Generation Run Queries
 *
 * CRUD operations for ThumbnailGenerationRun table.
 * Tracks standalone thumbnail generation progress.
 */

import { prisma } from '@/lib/prisma'
import type { ThumbnailGenerationRunRecord } from '@/lib/types/settings'

/**
 * Get the latest thumbnail generation run
 */
export async function getLatestThumbnailRun(): Promise<ThumbnailGenerationRunRecord | null> {
  const run = await prisma.thumbnailGenerationRun.findFirst({
    orderBy: { startedAt: 'desc' },
  })

  return run
}

/**
 * Check if thumbnail generation is currently in progress
 * Considers runs started within the last 30 minutes as potentially active
 */
export async function isThumbnailGenerationInProgress(): Promise<boolean> {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

  const activeRun = await prisma.thumbnailGenerationRun.findFirst({
    where: {
      status: 'started',
      startedAt: { gte: thirtyMinutesAgo },
    },
  })

  return !!activeRun
}

/**
 * Create a new thumbnail generation run
 */
export async function createThumbnailRun(
  enabledSizes: string[],
  totalImages: number
): Promise<bigint> {
  const run = await prisma.thumbnailGenerationRun.create({
    data: {
      status: 'started',
      startedAt: new Date(),
      enabledSizes: JSON.stringify(enabledSizes),
      totalImages,
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      progressPercent: 0,
    },
  })

  return run.id
}

/**
 * Update thumbnail generation progress
 */
export async function updateThumbnailProgress(
  runId: bigint,
  progress: {
    currentStep?: string
    currentStepDetail?: string
    progressPercent?: number
    processedCount?: number
    skippedCount?: number
    failedCount?: number
  }
): Promise<void> {
  await prisma.thumbnailGenerationRun.update({
    where: { id: runId },
    data: {
      currentStep: progress.currentStep,
      currentStepDetail: progress.currentStepDetail,
      progressPercent: progress.progressPercent,
      processedCount: progress.processedCount,
      skippedCount: progress.skippedCount,
      failedCount: progress.failedCount,
    },
  })
}

/**
 * Complete a thumbnail generation run
 */
export async function completeThumbnailRun(
  runId: bigint,
  status: 'completed' | 'failed',
  stats: {
    processedCount: number
    skippedCount: number
    failedCount: number
    errorMessage?: string
  }
): Promise<void> {
  await prisma.thumbnailGenerationRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt: new Date(),
      progressPercent: status === 'completed' ? 100 : undefined,
      processedCount: stats.processedCount,
      skippedCount: stats.skippedCount,
      failedCount: stats.failedCount,
      errorMessage: stats.errorMessage,
      currentStep: status === 'completed' ? 'Complete' : 'Failed',
      currentStepDetail: status === 'completed'
        ? `Generated ${stats.processedCount} thumbnails`
        : stats.errorMessage,
    },
  })
}

/**
 * Mark stale runs as failed (older than 30 minutes with status 'started')
 */
export async function cleanupStaleThumbnailRuns(): Promise<number> {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

  const result = await prisma.thumbnailGenerationRun.updateMany({
    where: {
      status: 'started',
      startedAt: { lt: thirtyMinutesAgo },
    },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: 'Marked as failed due to timeout (no progress for 30 minutes)',
    },
  })

  return result.count
}
