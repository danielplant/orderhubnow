/**
 * Thumbnail Queue Service
 *
 * Handles durable background thumbnail generation jobs.
 * Used when admin triggers "Generate Missing Thumbnails".
 *
 * Pattern: Follows export-queue.ts and webhook-queue.ts patterns
 *
 * Phase 3: Durable Background Jobs
 */

import { Queue, Worker, Job } from 'bullmq'
import { getRedisConnectionOptions, isRedisConfigured } from '../connectors/redis'
import {
  updateThumbnailProgress,
  completeThumbnailRun,
} from '@/lib/data/queries/thumbnails'
import { prisma } from '@/lib/prisma'
import { processThumbnailsBatch, type ThumbnailSyncItem } from '@/lib/utils/thumbnails'

// ============================================================================
// Types
// ============================================================================

export interface ThumbnailJobData {
  runId: string // ThumbnailGenerationRun.id as string for JSON serialization
  sizes: number[] // Which pixel sizes to generate (e.g., [120, 240])
  skuIds?: number[] // Optional specific SKU IDs, or null for all missing
  triggeredBy: string // userId or 'system'
}

export interface ThumbnailJobResult {
  success: boolean
  processedCount: number
  skippedCount: number
  failedCount: number
  error?: string
}

// ============================================================================
// Constants
// ============================================================================

const QUEUE_NAME = 'thumbnail-jobs'
const DEFAULT_CONCURRENCY = 1 // Only one thumbnail job at a time (memory intensive)

// ============================================================================
// Thumbnail Queue Class
// ============================================================================

class ThumbnailQueueService {
  private queue: Queue<ThumbnailJobData, ThumbnailJobResult> | null = null
  private worker: Worker<ThumbnailJobData, ThumbnailJobResult> | null = null
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
      console.log('[ThumbnailQueue] Redis not configured, running in sync mode')
      return false
    }

    try {
      const connectionOptions = getRedisConnectionOptions()

      // Create queue with job options
      this.queue = new Queue<ThumbnailJobData, ThumbnailJobResult>(QUEUE_NAME, {
        connection: connectionOptions,
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 10000, // 10s retry
          },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      })

      // Create worker to process jobs
      this.worker = new Worker<ThumbnailJobData, ThumbnailJobResult>(
        QUEUE_NAME,
        async (job) => this.processJob(job),
        {
          connection: connectionOptions,
          concurrency: this.concurrency,
          lockDuration: 1800000, // 30 minutes (thumbnail jobs can be very long)
        }
      )

      // Set up event handlers
      this.setupEventHandlers()
      this.setupGracefulShutdown()

      console.log(`[ThumbnailQueue] Initialized with concurrency ${this.concurrency}`)
      return true
    } catch (error) {
      console.error('[ThumbnailQueue] Failed to initialize:', error)
      return false
    }
  }

  /**
   * Enqueue a new thumbnail generation job
   */
  async enqueue(data: ThumbnailJobData): Promise<string> {
    if (!this.queue) {
      throw new Error('Thumbnail queue not initialized')
    }

    const job = await this.queue.add('thumbnail-generation', data, {
      jobId: data.runId,
    })

    console.log(`[ThumbnailQueue] Enqueued job ${job.id} for thumbnail generation`)
    return job.id!
  }

  /**
   * Process a single thumbnail generation job
   */
  private async processJob(
    job: Job<ThumbnailJobData, ThumbnailJobResult>
  ): Promise<ThumbnailJobResult> {
    const { runId, skuIds } = job.data
    const runIdBigInt = BigInt(runId)

    console.log(`[ThumbnailQueue] Processing thumbnail job ${runId}`)

    try {
      // Update run status
      await updateThumbnailProgress(runIdBigInt, {
        currentStep: 'querying',
        currentStepDetail: 'Fetching SKUs with missing thumbnails',
        progressPercent: 5,
      })

      // Build query for SKUs needing thumbnails
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        ShopifyImageURL: { not: null },
      }

      if (skuIds && skuIds.length > 0) {
        where.ID = { in: skuIds }
      }

      const skus = await prisma.sku.findMany({
        where,
        select: {
          ID: true,
          SkuID: true,
          ShopifyImageURL: true,
          ThumbnailPath: true,
        },
      })

      // Convert to ThumbnailSyncItem format
      const items: ThumbnailSyncItem[] = skus.map((sku) => ({
        skuId: sku.SkuID,
        imageUrl: sku.ShopifyImageURL,
        currentThumbnailPath: sku.ThumbnailPath,
      }))

      // Process using existing batch function
      const { stats } = await processThumbnailsBatch(items, {
        concurrency: 10,
        onProgress: async (processed, total, currentStats) => {
          const progress = Math.round((processed / total) * 100)
          await updateThumbnailProgress(runIdBigInt, {
            currentStep: 'generating',
            currentStepDetail: `Processed ${processed}/${total} SKUs`,
            progressPercent: progress,
            processedCount: currentStats.generated,
            skippedCount: currentStats.skipped,
            failedCount: currentStats.failed,
          })

          // Update BullMQ progress
          await job.updateProgress({ percent: progress })
        },
      })

      // Complete the run
      await completeThumbnailRun(runIdBigInt, 'completed', {
        processedCount: stats.generated,
        skippedCount: stats.skipped,
        failedCount: stats.failed,
      })

      console.log(
        `[ThumbnailQueue] Job ${runId} completed: ${stats.generated} processed, ${stats.skipped} skipped, ${stats.failed} failed`
      )

      return {
        success: true,
        processedCount: stats.generated,
        skippedCount: stats.skipped,
        failedCount: stats.failed,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      console.error(`[ThumbnailQueue] Job ${runId} failed:`, error)

      await completeThumbnailRun(runIdBigInt, 'failed', {
        processedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errorMessage,
      })

      return {
        success: false,
        processedCount: 0,
        skippedCount: 0,
        failedCount: 0,
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
          event: 'thumbnail_job_completed',
          runId: job.data.runId,
          success: result.success,
          processedCount: result.processedCount,
        })
      )
    })

    this.worker.on('failed', (job, err) => {
      console.error(
        JSON.stringify({
          event: 'thumbnail_job_failed',
          runId: job?.data.runId,
          error: err.message,
        })
      )
    })

    this.worker.on('error', (err) => {
      console.error('[ThumbnailQueue] Worker error:', err)
    })
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return
      this.isShuttingDown = true

      console.log(`[ThumbnailQueue] ${signal} received, shutting down gracefully...`)

      try {
        if (this.worker) {
          await this.worker.close()
        }
        if (this.queue) {
          await this.queue.close()
        }
      } catch (err) {
        console.error('[ThumbnailQueue] Error during shutdown:', err)
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
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: ThumbnailQueueService | null = null

export function getThumbnailQueue(): ThumbnailQueueService {
  if (!instance) {
    instance = new ThumbnailQueueService()
  }
  return instance
}

export async function initializeThumbnailQueue(): Promise<boolean> {
  const queue = getThumbnailQueue()
  return queue.initialize()
}
