/**
 * Export Queue Service
 *
 * Handles durable background export jobs for XLSX and PDF generation.
 * Uses BullMQ with Redis for job queue management.
 *
 * Pattern: Follows webhook-queue.ts and sync-worker.ts patterns
 *
 * Phase 3: Durable Background Jobs
 */

import { Queue, Worker, Job } from 'bullmq'
import { getRedisConnectionOptions, isRedisConfigured } from '../connectors/redis'
import { prisma } from '@/lib/prisma'
import { getExportPolicy } from '@/lib/data/queries/export-policy'
import { generateXlsxExport } from '@/lib/exports/xlsx-generator'
import { generatePdfExport } from '@/lib/exports/pdf-generator'
import { uploadToS3, deleteFromS3 } from '@/lib/s3'

// ============================================================================
// Types
// ============================================================================

export interface ExportJobData {
  jobId: string // Database record ID
  type: 'xlsx' | 'pdf'
  userId: string
  userRole: 'admin' | 'rep'
  filters: {
    collections?: string // 'all' | 'ats' | 'preorder' | '1,2,3'
    currency?: string // 'CAD' | 'USD' | 'both'
    q?: string // Search query
    orientation?: string // 'portrait' | 'landscape' (PDF only)
  }
}

export interface ExportJobResult {
  success: boolean
  s3Key?: string
  s3Url?: string
  filename?: string
  sizeBytes?: number
  error?: string
  metrics?: {
    totalSkus: number
    totalStyles: number
    imagesProcessed: number
    s3Hits: number
    shopifyFallbacks: number
    failures: number
    durationMs: number
  }
}

// ============================================================================
// Constants
// ============================================================================

const QUEUE_NAME = 'export-jobs'
const DEFAULT_CONCURRENCY = 2 // Max 2 exports at once (memory intensive)
const EXPORT_TTL_HOURS = 24 // How long to keep completed exports in S3

// ============================================================================
// Export Queue Class
// ============================================================================

class ExportQueueService {
  private queue: Queue<ExportJobData, ExportJobResult> | null = null
  private worker: Worker<ExportJobData, ExportJobResult> | null = null
  private isShuttingDown = false
  private concurrency: number

  constructor(concurrency = DEFAULT_CONCURRENCY) {
    this.concurrency = concurrency
  }

  /**
   * Initialize queue and worker if Redis is available
   */
  async initialize(): Promise<boolean> {
    if (!isRedisConfigured()) {
      console.log('[ExportQueue] Redis not configured, running in sync mode')
      return false
    }

    try {
      const connectionOptions = getRedisConnectionOptions()

      // Create queue with job options
      this.queue = new Queue<ExportJobData, ExportJobResult>(QUEUE_NAME, {
        connection: connectionOptions,
        defaultJobOptions: {
          // Note: No attempts/backoff - exports are user-initiated and shouldn't auto-retry
          removeOnComplete: 100, // Keep last 100 completed jobs in Redis
          removeOnFail: 500, // Keep last 500 failed jobs for debugging
        },
      })

      // Create worker to process jobs
      this.worker = new Worker<ExportJobData, ExportJobResult>(
        QUEUE_NAME,
        async (job) => this.processJob(job),
        {
          connection: connectionOptions,
          concurrency: this.concurrency,
          lockDuration: 600000, // 10 minutes (exports can be slow)
        }
      )

      // Set up event handlers
      this.setupEventHandlers()
      this.setupGracefulShutdown()

      console.log(`[ExportQueue] Initialized with concurrency ${this.concurrency}`)
      return true
    } catch (error) {
      console.error('[ExportQueue] Failed to initialize:', error)
      return false
    }
  }

  /**
   * Enqueue a new export job
   */
  async enqueue(data: ExportJobData): Promise<string> {
    if (!this.queue) {
      throw new Error('Export queue not initialized')
    }

    const job = await this.queue.add(`export-${data.type}`, data, {
      jobId: data.jobId, // Use DB record ID as job ID for idempotency
    })

    console.log(`[ExportQueue] Enqueued job ${job.id} for ${data.type} export`)
    return job.id!
  }

  /**
   * Process a single export job
   */
  private async processJob(
    job: Job<ExportJobData, ExportJobResult>
  ): Promise<ExportJobResult> {
    const { jobId, type, userId, userRole, filters } = job.data
    const startTime = Date.now()

    console.log(`[ExportQueue] Processing job ${jobId} (${type})`)

    try {
      // Update DB: Mark as processing
      await prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: 'processing',
          startedAt: new Date(),
          currentStep: 'querying',
          currentStepDetail: 'Fetching product data from database',
          progressPercent: 5,
        },
      })

      // Get export policy
      const exportPolicy = await getExportPolicy()

      // Update progress helper - returns false if job was cancelled
      const updateProgress = async (
        step: string,
        detail: string,
        percent: number,
        metrics?: Partial<ExportJobResult['metrics']>
      ): Promise<void> => {
        // Check if cancelled before updating
        const current = await prisma.exportJob.findUnique({
          where: { id: jobId },
          select: { status: true },
        })

        if (current?.status === 'cancelled') {
          return
        }

        await prisma.exportJob.update({
          where: { id: jobId },
          data: {
            currentStep: step,
            currentStepDetail: detail,
            progressPercent: percent,
            ...(metrics && {
              imagesProcessed: metrics.imagesProcessed,
              s3Hits: metrics.s3Hits,
              shopifyFallbacks: metrics.shopifyFallbacks,
              imageFetchFails: metrics.failures,
            }),
          },
        })
        // Also update BullMQ job progress (for Redis-based polling)
        await job.updateProgress({ step, percent })
      }

      // Generate export based on type
      let result: {
        buffer: Buffer
        filename: string
        metrics: NonNullable<ExportJobResult['metrics']>
      }

      if (type === 'xlsx') {
        result = await generateXlsxExport(filters, exportPolicy, userRole, updateProgress, jobId)
      } else {
        result = await generatePdfExport(filters, exportPolicy, userRole, updateProgress, jobId)
      }

      // Upload to S3 with organized key structure
      await updateProgress('uploading', 'Uploading completed file to storage', 90)

      // Organized by year-month and user for easier management
      const yearMonth = new Date().toISOString().slice(0, 7) // "2026-01"
      const s3Key = `exports/${yearMonth}/${userId}/${jobId}/${result.filename}`
      const contentType =
        type === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'

      const s3Url = await uploadToS3(result.buffer, s3Key, contentType)

      const durationMs = Date.now() - startTime
      const expiresAt = new Date(Date.now() + EXPORT_TTL_HOURS * 60 * 60 * 1000)

      // Check if job was cancelled during processing
      const currentJob = await prisma.exportJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      })

      if (currentJob?.status === 'cancelled') {
        console.log(`[ExportQueue] Job ${jobId} was cancelled during processing, cleaning up S3 file`)

        // Delete the orphaned S3 file we just uploaded
        try {
          await deleteFromS3(s3Key)
        } catch (cleanupErr) {
          console.error(`[ExportQueue] Failed to cleanup S3 file ${s3Key}:`, cleanupErr)
        }

        return {
          success: false,
          error: 'Job was cancelled',
        }
      }

      // Update DB: Mark as completed
      await prisma.exportJob.update({
        where: { id: jobId },
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

      console.log(`[ExportQueue] Job ${jobId} completed in ${durationMs}ms`)

      return {
        success: true,
        s3Key,
        s3Url,
        filename: result.filename,
        sizeBytes: result.buffer.length,
        metrics: { ...result.metrics, durationMs },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const durationMs = Date.now() - startTime

      console.error(`[ExportQueue] Job ${jobId} failed:`, error)

      // Check if job was cancelled - don't overwrite with 'failed'
      const currentJob = await prisma.exportJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      })

      if (currentJob?.status === 'cancelled') {
        console.log(`[ExportQueue] Job ${jobId} was cancelled, not marking as failed`)
        return {
          success: false,
          error: 'Job was cancelled',
        }
      }

      // Update DB: Mark as failed
      await prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          durationMs,
          currentStep: 'failed',
          currentStepDetail: errorMessage.slice(0, 500),
          errorMessage,
          retryCount: { increment: 1 },
        },
      })

      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Set up worker event handlers
   */
  private setupEventHandlers(): void {
    if (!this.worker) return

    this.worker.on('completed', (job, result) => {
      console.log(
        JSON.stringify({
          event: 'export_job_completed',
          jobId: job.data.jobId,
          type: job.data.type,
          success: result.success,
          durationMs: result.metrics?.durationMs,
        })
      )
    })

    this.worker.on('failed', (job, err) => {
      console.error(
        JSON.stringify({
          event: 'export_job_failed',
          jobId: job?.data.jobId,
          type: job?.data.type,
          error: err.message,
          attempts: job?.attemptsMade,
        })
      )
    })

    this.worker.on('error', (err) => {
      console.error('[ExportQueue] Worker error:', err)
    })
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return
      this.isShuttingDown = true

      console.log(`[ExportQueue] ${signal} received, shutting down gracefully...`)

      try {
        if (this.worker) {
          await this.worker.close()
          console.log('[ExportQueue] Worker closed')
        }
        if (this.queue) {
          await this.queue.close()
          console.log('[ExportQueue] Queue closed')
        }
      } catch (err) {
        console.error('[ExportQueue] Error during shutdown:', err)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }

  /**
   * Check if queue is ready
   */
  isReady(): boolean {
    return this.queue !== null && this.worker !== null
  }

  /**
   * Get queue stats for monitoring
   */
  async getStats(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
  } | null> {
    if (!this.queue) return null

    return {
      waiting: await this.queue.getWaitingCount(),
      active: await this.queue.getActiveCount(),
      completed: await this.queue.getCompletedCount(),
      failed: await this.queue.getFailedCount(),
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: ExportQueueService | null = null

export function getExportQueue(): ExportQueueService {
  if (!instance) {
    instance = new ExportQueueService()
  }
  return instance
}

export async function initializeExportQueue(): Promise<boolean> {
  const queue = getExportQueue()
  return queue.initialize()
}
