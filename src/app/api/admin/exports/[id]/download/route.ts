/**
 * Export Download API
 *
 * GET /api/admin/exports/{id}/download - Stream the export file
 *
 * Phase 3: Durable Background Jobs
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getFromS3 } from '@/lib/s3'

/**
 * GET /api/admin/exports/{id}/download
 *
 * Download the completed export file.
 * Streams the file from S3 to the client.
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

    // Check authorization (reps can only download their own jobs)
    if (session.user.role === 'rep' && job.triggeredBy !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (job.status !== 'completed' || !job.outputS3Key) {
      return NextResponse.json({ error: 'Export not ready' }, { status: 400 })
    }

    // Check if expired
    if (job.expiresAt && new Date() > job.expiresAt) {
      return NextResponse.json({ error: 'Export has expired' }, { status: 410 })
    }

    // Fetch file from S3
    const buffer = await getFromS3(job.outputS3Key)

    if (!buffer) {
      return NextResponse.json({ error: 'Export file not found' }, { status: 404 })
    }

    // Determine content type
    const contentType =
      job.type === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf'

    const filename = job.outputFilename || `export.${job.type === 'xlsx' ? 'xlsx' : 'pdf'}`

    // Buffer extends Uint8Array; cast to BodyInit for NextResponse compatibility
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('[ExportAPI] Download error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
