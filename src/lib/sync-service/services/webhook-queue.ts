/**
 * Webhook Queue - BullMQ setup for async webhook processing
 *
 * Features:
 * - Queue for reliable webhook processing
 * - Worker with concurrency control
 * - Exponential backoff retry
 * - Graceful shutdown handling
 * - Idempotency via Redis SET
 */

import { Queue, Worker, Job } from 'bullmq';
import type IORedis from 'ioredis';
import type { WebhookJob, WebhookProcessResult } from '../types/webhook';
import type { WebhookProcessor } from './webhook-processor';
import type { WebhookStatsService } from './webhook-stats';
import {
  getRedisClient,
  getRedisConnectionOptions,
  isRedisConfigured,
} from '../connectors/redis';

// ============================================================================
// Constants
// ============================================================================

const QUEUE_NAME = 'shopify-webhooks';
const WEBHOOK_ID_TTL = 86400; // 24 hours for idempotency check
const DEFAULT_CONCURRENCY = 5;

// ============================================================================
// Types
// ============================================================================

export interface WebhookQueueOptions {
  concurrency?: number;
  processor: WebhookProcessor;
  stats: WebhookStatsService;
}

export interface QueueStats {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

// ============================================================================
// WebhookQueueService Class
// ============================================================================

export class WebhookQueueService {
  private redis: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private processor: WebhookProcessor;
  private stats: WebhookStatsService;
  private concurrency: number;
  private isShuttingDown = false;

  constructor(options: WebhookQueueOptions) {
    this.processor = options.processor;
    this.stats = options.stats;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  }

  /**
   * Initialize Redis connection and queue.
   * Returns false if Redis is unavailable.
   */
  async initialize(): Promise<boolean> {
    if (!isRedisConfigured()) {
      console.warn(
        '[WebhookQueue] Redis not configured - webhooks will be processed synchronously'
      );
      return false;
    }

    try {
      // Use centralized Redis connector
      this.redis = await getRedisClient();
      await this.redis.ping();

      // Get connection options for BullMQ
      const connectionOptions = getRedisConnectionOptions();

      // Create queue with connection options
      this.queue = new Queue(QUEUE_NAME, {
        connection: connectionOptions,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000, // 1s → 2s → 4s
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      });

      // Create worker
      this.worker = new Worker(
        QUEUE_NAME,
        async (job: Job<WebhookJob>) => this.processJob(job),
        {
          connection: connectionOptions,
          concurrency: this.concurrency,
          limiter: {
            max: 10,
            duration: 1000, // Max 10 jobs per second
          },
        }
      );

      // Setup worker event handlers
      this.setupWorkerEvents();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      console.log(`[WebhookQueue] Initialized with Redis`);
      return true;
    } catch (err) {
      console.warn(`[WebhookQueue] Redis unavailable: ${err}`);
      console.warn('[WebhookQueue] Webhooks will be processed synchronously');
      return false;
    }
  }

  /**
   * Check if a webhook has already been processed (idempotency).
   */
  async isDuplicate(webhookId: string): Promise<boolean> {
    if (!this.redis) {
      return false; // Can't check without Redis
    }

    const key = `webhook:seen:${webhookId}`;
    const result = await this.redis.set(key, '1', 'EX', WEBHOOK_ID_TTL, 'NX');
    return result === null; // NX returns null if key already exists
  }

  /**
   * Add webhook to queue for async processing.
   */
  async enqueue(job: WebhookJob): Promise<string | null> {
    if (!this.queue) {
      return null; // Queue not available
    }

    const added = await this.queue.add(job.topic, job, {
      jobId: job.id, // Use webhook ID as job ID for deduplication
    });

    return added.id ?? null;
  }

  /**
   * Process a queued job.
   */
  private async processJob(job: Job<WebhookJob>): Promise<WebhookProcessResult> {
    const startTime = Date.now();
    const { data } = job;

    console.log(`[WebhookQueue] Processing ${data.topic} (${data.id})`);

    try {
      const result = await this.processor.process(data);

      // Record stats
      await this.stats.recordWebhook({
        id: crypto.randomUUID(),
        webhookId: data.id,
        topic: data.topic,
        shopDomain: data.shopDomain,
        receivedAt: data.receivedAt,
        processedAt: new Date().toISOString(),
        status: result.success ? 'completed' : 'failed',
        mappingsProcessed: result.mappingsProcessed,
        recordsWritten: result.recordsWritten,
        error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
        processingMs: Date.now() - startTime,
      });

      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);

      // Record failure
      await this.stats.recordWebhook({
        id: crypto.randomUUID(),
        webhookId: data.id,
        topic: data.topic,
        shopDomain: data.shopDomain,
        receivedAt: data.receivedAt,
        processedAt: new Date().toISOString(),
        status: 'failed',
        mappingsProcessed: [],
        recordsWritten: 0,
        error,
        processingMs: Date.now() - startTime,
      });

      throw err; // Re-throw for retry handling
    }
  }

  /**
   * Setup worker event handlers.
   */
  private setupWorkerEvents(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      console.log(`[WebhookQueue] Completed ${job.name} (${job.id})`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(
        `[WebhookQueue] Failed ${job?.name} (${job?.id}): ${err.message}`
      );
    });

    this.worker.on('error', (err) => {
      console.error(`[WebhookQueue] Worker error: ${err.message}`);
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
        `[WebhookQueue] ${signal} received, shutting down gracefully...`
      );

      try {
        if (this.worker) {
          await this.worker.close();
          console.log('[WebhookQueue] Worker closed');
        }

        if (this.queue) {
          await this.queue.close();
          console.log('[WebhookQueue] Queue closed');
        }

        // Don't close shared Redis client here - let the main process handle it
        this.redis = null;
      } catch (err) {
        console.error(`[WebhookQueue] Error during shutdown: ${err}`);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Get queue statistics.
   */
  async getQueueStats(): Promise<QueueStats> {
    if (!this.queue) {
      return { waiting: 0, active: 0, delayed: 0, failed: 0 };
    }

    const [waiting, active, delayed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getDelayedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, delayed, failed };
  }

  /**
   * Check if queue is available.
   */
  isAvailable(): boolean {
    return this.queue !== null;
  }

  /**
   * Close all connections.
   */
  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    // Don't close shared Redis client here
    this.redis = null;
  }
}

// Factory function
export function createWebhookQueue(
  options: WebhookQueueOptions
): WebhookQueueService {
  return new WebhookQueueService(options);
}

// Singleton instance
let webhookQueueInstance: WebhookQueueService | null = null;

/**
 * Get singleton webhook queue instance.
 * Returns the instance but caller should call initialize() before using.
 */
export async function getWebhookQueue(): Promise<WebhookQueueService> {
  if (!webhookQueueInstance) {
    // Lazy import to avoid circular dependencies
    const { getWebhookProcessor } = await import('./webhook-processor');
    const { getWebhookStatsService } = await import('./webhook-stats');

    webhookQueueInstance = new WebhookQueueService({
      processor: getWebhookProcessor(),
      stats: getWebhookStatsService(),
    });

    // Initialize the queue (connects to Redis if available)
    await webhookQueueInstance.initialize();
  }
  return webhookQueueInstance;
}
