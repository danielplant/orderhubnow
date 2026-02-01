/**
 * Single Export Job API
 *
 * GET /api/admin/exports/{id} - Get job status
 *
 * Phase 3: Durable Background Jobs
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/exports/{id}
 *
 * Get status of a specific export job for polling.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'rep')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const job = await prisma.exportJob.findUnique({
      where: { id },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check authorization (reps can only see their own jobs)
    if (session.user.role === 'rep' && job.triggeredBy !== String(session.user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build download URL for completed jobs
    // Use the outputS3Key to construct a URL - in production this could be a signed URL
    let downloadUrl: string | null = null
    if (job.status === 'completed' && job.outputS3Key) {
      // For now, use the direct download endpoint
      downloadUrl = `/api/admin/exports/${job.id}/download`
    }

    return NextResponse.json({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: {
        percent: job.progressPercent,
        step: job.currentStep,
        detail: job.currentStepDetail,
      },
      timing: {
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        durationMs: job.durationMs,
      },
      result:
        job.status === 'completed'
          ? {
              filename: job.outputFilename,
              sizeBytes: job.outputSizeBytes,
              downloadUrl,
              expiresAt: job.expiresAt,
            }
          : null,
      metrics:
        job.status === 'completed'
          ? {
              totalSkus: job.totalSkus,
              imagesProcessed: job.imagesProcessed,
              s3Hits: job.s3Hits,
              shopifyFallbacks: job.shopifyFallbacks,
              failures: job.imageFetchFails,
            }
          : null,
      error: job.status === 'failed' ? job.errorMessage : null,
    })
  } catch (error) {
    console.error('[ExportAPI] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
