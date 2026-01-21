/**
 * Sync Worker - BullMQ Worker for processing scheduled sync jobs
 *
 * Features:
 * - Processes jobs from sync-scheduler queue
 * - Overlap prevention (skips if sync already running)
 * - Timeout handling per job type
 * - Consecutive failure tracking
 * - Graceful shutdown
 */

import { Worker, Job } from 'bullmq';
import type { SyncEngine } from './sync-engine';
import type { SyncResult } from '../types/sync';
import type { SchedulerService, ScheduleJobData } from './scheduler-service';
import { getRedisConnectionOptions, isRedisConfigured } from '../connectors/redis';

// ============================================================================
// Constants
// ============================================================================

const WORKER_CONCURRENCY = 1; // Only one sync at a time per worker
const LOCK_DURATION = 30 * 60 * 1000; // 30 min lock (full syncs can be long)

// ============================================================================
// Types
// ============================================================================

export interface SyncWorkerOptions {
  syncEngine: SyncEngine;
  schedulerService: SchedulerService;
}

export interface SyncJobResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  result?: SyncResult;
}

// ============================================================================
// SyncWorker Class
// ============================================================================

export class SyncWorker {
  private worker: Worker<ScheduleJobData, SyncJobResult> | null = null;
  private syncEngine: SyncEngine;
  private schedulerService: SchedulerService;
  private isShuttingDown = false;

  constructor(options: SyncWorkerOptions) {
    this.syncEngine = options.syncEngine;
    this.schedulerService = options.schedulerService;
  }

  /**
   * Start the worker.
   */
  async start(): Promise<boolean> {
    if (!isRedisConfigured()) {
      console.warn('[SyncWorker] Redis not configured - worker cannot start');
      return false;
    }

    const queueName = this.schedulerService.getQueueName();

    try {
      // Use centralized Redis connector
      const connectionOptions = getRedisConnectionOptions();

      this.worker = new Worker<ScheduleJobData, SyncJobResult>(
        queueName,
        async (job) => this.processJob(job),
        {
          connection: connectionOptions,
          concurrency: WORKER_CONCURRENCY,
          lockDuration: LOCK_DURATION,
        }
      );

      this.setupEventHandlers();
      this.setupGracefulShutdown();

      console.log(`[SyncWorker] Started processing queue: ${queueName}`);
      return true;
    } catch (err) {
      console.error(`[SyncWorker] Failed to start: ${err}`);
      return false;
    }
  }

  /**
   * Process a scheduled sync job.
   */
  private async processJob(job: Job<ScheduleJobData>): Promise<SyncJobResult> {
    const { mappingId, type, options } = job.data;

    console.log(
      `[SyncWorker] Processing ${type} sync for ${mappingId} (job ${job.id})`
    );

    // Check if sync already running (from manual trigger or previous job)
    const running = this.syncEngine.getRunningSync(mappingId);
    if (running) {
      console.log(
        `[SyncWorker] Skipping ${mappingId} - sync already running (${running.type})`
      );
      return { success: true, skipped: true, reason: 'sync_already_running' };
    }

    try {
      let result: SyncResult;

      if (type === 'incremental') {
        result = await this.syncEngine.incrementalSync({
          mappingId,
          dryRun: false, // Scheduled jobs are always real
          lookbackMinutes: options?.lookbackMinutes ?? 15,
          onProgress: (progress) => {
            // Update job progress
            job
              .updateProgress({
                phase: progress.phase,
                fetched: progress.recordsFetched,
                written: progress.recordsWritten,
                elapsed: progress.elapsedMs,
              })
              .catch(() => {});
          },
        });
      } else {
        result = await this.syncEngine.fullSync({
          mappingId,
          dryRun: false, // Scheduled jobs are always real
          deleteStale: options?.deleteStale ?? false,
          onProgress: (progress) => {
            job
              .updateProgress({
                phase: progress.phase,
                fetched: progress.recordsFetched,
                written: progress.recordsWritten,
                elapsed: progress.elapsedMs,
              })
              .catch(() => {});
          },
        });
      }

      // Reset failure count on success
      if (result.success) {
        await this.schedulerService.resetFailures(mappingId);
      }

      return { success: result.success, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[SyncWorker] Error processing ${mappingId}: ${error}`);
      throw err; // Re-throw for BullMQ retry handling
    }
  }

  /**
   * Setup worker event handlers.
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on('completed', async (job, result) => {
      const { mappingId, type } = job.data;

      if (result.skipped) {
        console.log(`[SyncWorker] Job ${job.id} skipped: ${result.reason}`);
      } else {
        console.log(`[SyncWorker] Completed ${type} sync for ${mappingId}:`, {
          success: result.result?.success,
          fetched: result.result?.stats.fetched,
          written:
            (result.result?.stats.inserted ?? 0) +
            (result.result?.stats.updated ?? 0),
          duration: result.result?.duration.totalMs,
        });
      }
    });

    this.worker.on('failed', async (job, err) => {
      if (!job) return;

      const { mappingId, type } = job.data;

      // Track consecutive failures
      const failures = await this.schedulerService.recordFailure(mappingId);

      console.error(
        `[SyncWorker] Failed ${type} sync for ${mappingId} (attempt ${job.attemptsMade}/${job.opts.attempts}):`,
        {
          error: err.message,
          consecutiveFailures: failures,
        }
      );
    });

    this.worker.on('error', (err) => {
      console.error(`[SyncWorker] Worker error: ${err.message}`);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`[SyncWorker] Job ${jobId} stalled`);
    });
  }

  /**
   * Setup graceful shutdown handlers.
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log(
        `[SyncWorker] ${signal} received, shutting down gracefully...`
      );

      try {
        if (this.worker) {
          await this.worker.close();
          console.log('[SyncWorker] Worker closed');
        }
      } catch (err) {
        console.error(`[SyncWorker] Error during shutdown: ${err}`);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Check if worker is running.
   */
  isRunning(): boolean {
    return this.worker !== null && !this.isShuttingDown;
  }

  /**
   * Stop the worker.
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}

// Factory function
export function createSyncWorker(options: SyncWorkerOptions): SyncWorker {
  return new SyncWorker(options);
}
