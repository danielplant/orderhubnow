/**
 * Export Cleanup Service
 *
 * Scheduled job to delete expired exports from S3.
 * Should be triggered via scheduler or manually.
 *
 * Phase 3: Durable Background Jobs
 */

import { prisma } from '@/lib/prisma'
import { deleteFromS3 } from '@/lib/s3'

/**
 * Cleanup expired exports from S3 and update DB records.
 * Should be scheduled to run daily.
 *
 * @returns Object with count of deleted files and errors
 */
export async function cleanupExpiredExports(): Promise<{
  deleted: number
  errors: number
  errorDetails: string[]
}> {
  const now = new Date()

  // Find export jobs with S3 files that need cleanup:
  // 1. Completed jobs past their expiry date
  // 2. Cancelled jobs with orphaned S3 files (safety net)
  const expired = await prisma.exportJob.findMany({
    where: {
      OR: [
        // Normal case: completed jobs past expiry
        {
          status: 'completed',
          expiresAt: { lt: now },
          outputS3Key: { not: null },
        },
        // Edge case: cancelled jobs that somehow have S3 files
        {
          status: 'cancelled',
          outputS3Key: { not: null },
        },
      ],
    },
    select: { id: true, outputS3Key: true, status: true },
  })

  let deleted = 0
  let errors = 0
  const errorDetails: string[] = []

  console.log(
    JSON.stringify({
      event: 'export_cleanup_started',
      timestamp: now.toISOString(),
      expiredCount: expired.length,
    })
  )

  for (const job of expired) {
    try {
      // Delete from S3
      await deleteFromS3(job.outputS3Key!)

      // Update DB - clear S3 key and update status appropriately
      // Cancelled jobs stay cancelled, completed jobs become expired
      const newStatus = job.status === 'cancelled' ? 'cancelled' : 'expired'
      const newStep = job.status === 'cancelled' ? 'cancelled' : 'expired'

      await prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: newStatus,
          outputS3Key: null,
          currentStep: newStep,
          currentStepDetail: `S3 file deleted on ${now.toISOString()}`,
        },
      })

      deleted++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[ExportCleanup] Failed to delete ${job.id}:`, err)
      errors++
      errorDetails.push(`${job.id}: ${errorMessage}`)
    }
  }

  console.log(
    JSON.stringify({
      event: 'export_cleanup_completed',
      timestamp: new Date().toISOString(),
      deleted,
      errors,
    })
  )

  return { deleted, errors, errorDetails }
}

/**
 * Get cleanup statistics for monitoring.
 *
 * @returns Statistics about expired and cleanup-eligible jobs
 */
export async function getCleanupStats(): Promise<{
  pendingCleanup: number
  alreadyCleaned: number
  totalCompleted: number
}> {
  const now = new Date()

  const [pendingCleanup, alreadyCleaned, totalCompleted] = await Promise.all([
    prisma.exportJob.count({
      where: {
        status: 'completed',
        expiresAt: { lt: now },
        outputS3Key: { not: null },
      },
    }),
    prisma.exportJob.count({
      where: {
        status: 'expired',
      },
    }),
    prisma.exportJob.count({
      where: {
        status: 'completed',
      },
    }),
  ])

  return {
    pendingCleanup,
    alreadyCleaned,
    totalCompleted,
  }
}
