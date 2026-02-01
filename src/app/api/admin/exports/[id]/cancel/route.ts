/**
 * Export Job Cancel API
 *
 * POST /api/admin/exports/{id}/cancel - Cancel a pending or processing export job
 *
 * Phase 3: Durable Background Jobs
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/admin/exports/{id}/cancel
 *
 * Cancel an export job. Only works for pending or processing jobs.
 * The job must belong to the user (or user must be admin).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'rep')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Fetch the job
    const job = await prisma.exportJob.findUnique({
      where: { id },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check authorization (reps can only cancel their own jobs)
    if (session.user.role === 'rep' && job.triggeredBy !== String(session.user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Can only cancel pending or processing jobs
    if (job.status !== 'pending' && job.status !== 'processing') {
      return NextResponse.json(
        { error: `Cannot cancel job with status: ${job.status}` },
        { status: 400 }
      )
    }

    // Update job status to cancelled
    const updatedJob = await prisma.exportJob.update({
      where: { id },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        currentStep: 'cancelled',
        currentStepDetail: `Cancelled by ${session.user.role} at ${new Date().toISOString()}`,
      },
    })

    console.log(
      JSON.stringify({
        event: 'export_job_cancelled',
        jobId: id,
        cancelledBy: session.user.id,
        cancelledByRole: session.user.role,
        previousStatus: job.status,
      })
    )

    return NextResponse.json({
      success: true,
      jobId: updatedJob.id,
      status: updatedJob.status,
    })
  } catch (error) {
    console.error('[ExportAPI] Cancel error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
