/**
 * Export Jobs API
 *
 * POST /api/admin/exports - Create new export job
 * GET /api/admin/exports - List recent export jobs
 *
 * Phase 3: Durable Background Jobs
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import {
  getExportQueue,
  initializeExportQueue,
} from '@/lib/sync-service/services/export-queue'
import { isRedisConfigured } from '@/lib/sync-service/connectors/redis'
import { getExportPolicy } from '@/lib/data/queries/export-policy'
import { getThumbnailCoverageForExport } from '@/lib/data/queries/thumbnail-coverage'
import { generateXlsxExport } from '@/lib/exports/xlsx-generator'
import { generatePdfExport } from '@/lib/exports/pdf-generator'
import { uploadToS3 } from '@/lib/s3'

// ============================================================================
// POST /api/admin/exports - Create new export job
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'rep')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, collections, currency, q, orientation } = body

    // Validate type
    if (!['xlsx', 'pdf'].includes(type)) {
      return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
    }

    // Get export policy for coverage check
    const exportPolicy = await getExportPolicy()

    // Parse collection filter for scoped coverage check
    let collectionIds: number[] | undefined

    if (collections && collections !== 'all') {
      if (collections === 'ats' || collections === 'preorder') {
        // Get collection IDs by type
        const cols = await prisma.collection.findMany({
          where: { type: collections === 'ats' ? 'ats' : { in: ['preorder_no_po', 'preorder_po'] } },
          select: { id: true }
        })
        collectionIds = cols.map(c => c.id)
      } else {
        // Comma-separated IDs
        collectionIds = collections.split(',').map((id: string) => parseInt(id)).filter((n: number) => !isNaN(n))
      }
    }

    // Coverage check for admins (reps bypass and use fallback)
    // Now scoped to the collections being exported
    if (session.user.role === 'admin' && exportPolicy.requireS3) {
      const coverage = await getThumbnailCoverageForExport(exportPolicy.thumbnailSize, collectionIds)
      if (coverage.coveragePercent < 100) {
        return NextResponse.json(
          {
            error: 'COVERAGE_REQUIRED',
            message: `${coverage.missing} thumbnails missing for export`,
            coverage,
          },
          { status: 400 }
        )
      }
    }

    // Create job record in database
    const job = await prisma.exportJob.create({
      data: {
        type,
        triggeredBy: String(session.user.id),
        triggeredByRole: session.user.role,
        filters: JSON.stringify({ collections, currency, q, orientation }),
        status: 'pending',
        currentStep: 'queued',
        currentStepDetail: 'Waiting in queue',
        progressPercent: 0,
      },
    })

    // Try to enqueue to Redis
    if (isRedisConfigured()) {
      try {
        await initializeExportQueue()
        const queue = getExportQueue()

        if (queue.isReady()) {
          await queue.enqueue({
            jobId: job.id,
            type: type as 'xlsx' | 'pdf',
            userId: session.user.id,
            userRole: session.user.role as 'admin' | 'rep',
            filters: { collections, currency, q, orientation },
          })

          return NextResponse.json({
            jobId: job.id,
            status: 'pending',
            message: 'Export job queued',
            pollUrl: `/api/admin/exports/${job.id}`,
          })
        }
      } catch (err) {
        console.warn('[ExportAPI] Failed to enqueue, falling back to sync mode:', err)
      }
    }

    // Fallback: Process synchronously (degraded mode)
    console.log('[ExportAPI] Processing synchronously (Redis unavailable)')

    // Mark as processing
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: 'processing', startedAt: new Date() },
    })

    const startTime = Date.now()

    try {
      // No-op progress callback for sync mode
      const onProgress = async () => {}

      // Generate export
      const result =
        type === 'xlsx'
          ? await generateXlsxExport(
              { collections, currency, q },
              exportPolicy,
              session.user.role as 'admin' | 'rep',
              onProgress
            )
          : await generatePdfExport(
              { collections, currency, q, orientation },
              exportPolicy,
              session.user.role as 'admin' | 'rep',
              onProgress
            )

      // Upload to S3
      const yearMonth = new Date().toISOString().slice(0, 7)
      const s3Key = `exports/${yearMonth}/${session.user.id}/${job.id}/${result.filename}`
      const contentType =
        type === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'

      const s3Url = await uploadToS3(result.buffer, s3Key, contentType)

      const durationMs = Date.now() - startTime
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

      // Update job as completed
      await prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs,
          progressPercent: 100,
          currentStep: 'completed',
          currentStepDetail: 'Export ready for download',
          totalSkus: result.metrics.totalSkus,
          imagesProcessed: result.metrics.imagesProcessed,
          s3Hits: result.metrics.s3Hits,
          shopifyFallbacks: result.metrics.shopifyFallbacks,
          imageFetchFails: result.metrics.failures,
          outputS3Key: s3Key,
          outputFilename: result.filename,
          outputSizeBytes: result.buffer.length,
          expiresAt,
        },
      })

      return NextResponse.json({
        jobId: job.id,
        status: 'completed',
        message: 'Export completed (sync mode)',
        downloadUrl: s3Url,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const durationMs = Date.now() - startTime

      await prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          durationMs,
          currentStep: 'failed',
          currentStepDetail: errorMessage.slice(0, 500),
          errorMessage,
        },
      })

      throw error
    }
  } catch (error) {
    console.error('[ExportAPI] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET /api/admin/exports - List recent export jobs
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'rep')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // Admins see all jobs, reps see only their own
    const where =
      session.user.role === 'admin' ? {} : { triggeredBy: String(session.user.id) }

    const jobs = await prisma.exportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        progressPercent: true,
        currentStep: true,
        createdAt: true,
        completedAt: true,
        durationMs: true,
        outputFilename: true,
        outputSizeBytes: true,
        errorMessage: true,
      },
    })

    return NextResponse.json({ jobs })
  } catch (error) {
    console.error('[ExportAPI] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
