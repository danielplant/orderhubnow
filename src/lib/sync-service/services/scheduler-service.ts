/**
 * Scheduler Service - BullMQ Job Schedulers for sync automation
 *
 * Features:
 * - Create/update/remove job schedulers using BullMQ upsertJobScheduler
 * - Cron expression validation with minimum interval enforcement
 * - Timezone support
 * - Human-readable schedule descriptions
 * - Missed job recovery on startup
 */

import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { CronExpressionParser } from 'cron-parser';
import {
  getRedisClient,
  getRedisConnectionOptions,
  isRedisConfigured,
} from '../connectors/redis';

// ============================================================================
// Constants
// ============================================================================

const QUEUE_NAME = 'sync-scheduler';
const MIN_INCREMENTAL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_FULL_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FAILURE_KEY_TTL = 86400; // 24 hours

// ============================================================================
// Types
// ============================================================================

export interface ScheduleConfig {
  mappingId: string;
  enabled: boolean;
  type: 'incremental' | 'full';
  pattern: string; // Cron expression: "*/15 * * * *"
  timezone?: string; // IANA timezone: "America/Toronto", default "UTC"
  options?: {
    lookbackMinutes?: number; // For incremental (default: 15)
    deleteStale?: boolean; // For full sync (default: false)
  };
}

export interface SchedulerInfo {
  id: string;
  mappingId: string;
  mappingName: string;
  type: 'incremental' | 'full';
  pattern: string;
  patternHuman: string; // "Every 15 minutes"
  timezone: string;
  enabled: boolean;
  nextRun: string | null;
  nextRuns: string[]; // Next 5 run times
  lastRun: string | null;
  lastStatus: 'success' | 'partial' | 'failed' | null;
  lastDurationMs: number | null;
  lastRecordCount: number | null;
  consecutiveFailures: number;
}

export interface ScheduleJobData {
  mappingId: string;
  type: 'incremental' | 'full';
  options?: {
    lookbackMinutes?: number;
    deleteStale?: boolean;
  };
  scheduledBy: 'scheduler' | 'manual';
}

interface BullMQScheduler {
  key: string;
  name: string;
  id?: string | null;
  endDate?: number | null;
  tz?: string | null;
  pattern?: string | null;
  every?: string | null;
  next?: number | null;
}

// ============================================================================
// SchedulerService Class
// ============================================================================

export class SchedulerService {
  private redis: IORedis | null = null;
  private queue: Queue | null = null;
  private scheduleConfigs = new Map<string, ScheduleConfig>();

  /**
   * Initialize Redis connection and queue.
   */
  async initialize(): Promise<boolean> {
    if (!isRedisConfigured()) {
      console.warn(
        '[SchedulerService] Redis not configured - scheduling unavailable'
      );
      return false;
    }

    try {
      // Use centralized Redis connector
      this.redis = await getRedisClient();
      await this.redis.ping();

      // Get connection options for BullMQ
      const connectionOptions = getRedisConnectionOptions();

      this.queue = new Queue(QUEUE_NAME, {
        connection: connectionOptions,
      });

      console.log(`[SchedulerService] Initialized with Redis`);
      return true;
    } catch (err) {
      console.warn(`[SchedulerService] Redis unavailable: ${err}`);
      return false;
    }
  }

  /**
   * Create or update a schedule using BullMQ's upsertJobScheduler.
   */
  async upsertSchedule(
    config: ScheduleConfig
  ): Promise<{ success: boolean; message: string }> {
    if (!this.queue) {
      return {
        success: false,
        message: 'Scheduler not initialized (Redis unavailable)',
      };
    }

    // Validate cron expression
    const validation = this.validatePattern(config.type, config.pattern);
    if (!validation.valid) {
      return { success: false, message: validation.error! };
    }

    const schedulerId = this.getSchedulerId(config.mappingId);
    const timezone = config.timezone ?? 'UTC';

    try {
      if (config.enabled) {
        await this.queue.upsertJobScheduler(
          schedulerId,
          {
            pattern: config.pattern,
            tz: timezone,
          },
          {
            name: `sync-${config.type}-${config.mappingId}`,
            data: {
              mappingId: config.mappingId,
              type: config.type,
              options: config.options ?? {},
              scheduledBy: 'scheduler',
            } as ScheduleJobData,
            opts: {
              removeOnComplete: 50,
              removeOnFail: 100,
            },
          }
        );

        console.log(
          `[SchedulerService] Created/updated schedule ${schedulerId}: ${config.pattern} (${timezone})`
        );
      } else {
        // Disabled - remove the scheduler
        await this.queue.removeJobScheduler(schedulerId);
        console.log(`[SchedulerService] Disabled schedule ${schedulerId}`);
      }

      // Store config for reference
      this.scheduleConfigs.set(config.mappingId, config);

      return {
        success: true,
        message: config.enabled
          ? `Schedule set: ${this.patternToHuman(config.pattern)} (${timezone})`
          : 'Schedule disabled',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[SchedulerService] Error upserting schedule: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Remove a schedule.
   */
  async removeSchedule(mappingId: string): Promise<boolean> {
    if (!this.queue) {
      return false;
    }

    const schedulerId = this.getSchedulerId(mappingId);

    try {
      const removed = await this.queue.removeJobScheduler(schedulerId);
      this.scheduleConfigs.delete(mappingId);
      console.log(
        `[SchedulerService] Removed schedule ${schedulerId}: ${removed}`
      );
      return removed;
    } catch (err) {
      console.error(`[SchedulerService] Error removing schedule: ${err}`);
      return false;
    }
  }

  /**
   * Get scheduler info for a mapping.
   */
  async getSchedule(
    mappingId: string,
    mappingName: string,
    lastStatus?: { status: string; duration?: number; recordCount?: number }
  ): Promise<SchedulerInfo | null> {
    if (!this.queue) {
      return null;
    }

    const schedulerId = this.getSchedulerId(mappingId);

    try {
      const scheduler = await this.queue.getJobScheduler(schedulerId);
      if (!scheduler) {
        return null;
      }

      const config = this.scheduleConfigs.get(mappingId);
      const consecutiveFailures = await this.getConsecutiveFailures(mappingId);

      return this.schedulerToInfo(
        scheduler as BullMQScheduler,
        mappingId,
        mappingName,
        config,
        {
          lastStatus:
            (lastStatus?.status as 'success' | 'partial' | 'failed' | null) ??
            null,
          lastDurationMs: lastStatus?.duration ?? null,
          lastRecordCount: lastStatus?.recordCount ?? null,
          consecutiveFailures,
        }
      );
    } catch (err) {
      console.error(`[SchedulerService] Error getting schedule: ${err}`);
      return null;
    }
  }

  /**
   * List all schedulers with their info.
   */
  async listSchedules(
    mappingLookup: Map<
      string,
      {
        name: string;
        lastStatus?: { status: string; duration?: number; recordCount?: number };
      }
    >
  ): Promise<SchedulerInfo[]> {
    if (!this.queue) {
      return [];
    }

    try {
      const schedulers = await this.queue.getJobSchedulers(0, 100, true);
      const result: SchedulerInfo[] = [];

      for (const scheduler of schedulers) {
        const mappingId = this.getMappingIdFromScheduler(scheduler.key);
        if (!mappingId) continue;

        const mapping = mappingLookup.get(mappingId);
        if (!mapping) continue;

        const config = this.scheduleConfigs.get(mappingId);
        const consecutiveFailures = await this.getConsecutiveFailures(mappingId);

        result.push(
          this.schedulerToInfo(
            scheduler as BullMQScheduler,
            mappingId,
            mapping.name,
            config,
            {
              lastStatus:
                (mapping.lastStatus?.status as
                  | 'success'
                  | 'partial'
                  | 'failed'
                  | null) ?? null,
              lastDurationMs: mapping.lastStatus?.duration ?? null,
              lastRecordCount: mapping.lastStatus?.recordCount ?? null,
              consecutiveFailures,
            }
          )
        );
      }

      return result;
    } catch (err) {
      console.error(`[SchedulerService] Error listing schedules: ${err}`);
      return [];
    }
  }

  /**
   * Trigger an immediate run (bypasses schedule).
   */
  async runNow(
    mappingId: string,
    type: 'incremental' | 'full',
    options?: ScheduleConfig['options']
  ): Promise<string | null> {
    if (!this.queue) {
      return null;
    }

    const job = await this.queue.add(
      `sync-${type}-${mappingId}-manual`,
      {
        mappingId,
        type,
        options: options ?? {},
        scheduledBy: 'manual',
      } as ScheduleJobData,
      {
        removeOnComplete: 50,
        removeOnFail: 100,
      }
    );

    console.log(
      `[SchedulerService] Triggered immediate run for ${mappingId}: job ${job.id}`
    );
    return job.id ?? null;
  }

  /**
   * Pause a schedule (keeps config but stops producing jobs).
   */
  async pauseSchedule(mappingId: string): Promise<boolean> {
    const config = this.scheduleConfigs.get(mappingId);
    if (!config) {
      return false;
    }

    config.enabled = false;
    const result = await this.upsertSchedule(config);
    return result.success;
  }

  /**
   * Resume a paused schedule.
   */
  async resumeSchedule(mappingId: string): Promise<boolean> {
    const config = this.scheduleConfigs.get(mappingId);
    if (!config) {
      return false;
    }

    config.enabled = true;
    const result = await this.upsertSchedule(config);
    return result.success;
  }

  /**
   * Check for and trigger missed jobs on startup.
   */
  async recoverMissedJobs(): Promise<number> {
    if (!this.queue) {
      return 0;
    }

    let recovered = 0;

    try {
      const schedulers = await this.queue.getJobSchedulers(0, 100, true);

      for (const scheduler of schedulers) {
        // If next run time is in the past, we missed it
        if (scheduler.next && scheduler.next < Date.now()) {
          const mappingId = this.getMappingIdFromScheduler(scheduler.key);
          if (mappingId) {
            const config = this.scheduleConfigs.get(mappingId);
            console.log(
              `[SchedulerService] Missed job detected for ${mappingId}, triggering now`
            );
            await this.runNow(
              mappingId,
              config?.type ?? 'incremental',
              config?.options
            );
            recovered++;
          }
        }
      }
    } catch (err) {
      console.error(`[SchedulerService] Error recovering missed jobs: ${err}`);
    }

    return recovered;
  }

  /**
   * Record job failure (for consecutive failure tracking).
   */
  async recordFailure(mappingId: string): Promise<number> {
    if (!this.redis) {
      return 0;
    }

    const key = `scheduler:failures:${mappingId}`;
    const failures = await this.redis.incr(key);
    await this.redis.expire(key, FAILURE_KEY_TTL);

    if (failures >= 3) {
      console.error(
        `[ALERT] Mapping ${mappingId} failed ${failures} consecutive times`
      );
    }

    return failures;
  }

  /**
   * Reset failure count on success.
   */
  async resetFailures(mappingId: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    const key = `scheduler:failures:${mappingId}`;
    await this.redis.del(key);
  }

  /**
   * Get consecutive failure count.
   */
  async getConsecutiveFailures(mappingId: string): Promise<number> {
    if (!this.redis) {
      return 0;
    }

    const key = `scheduler:failures:${mappingId}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Check if scheduler is available.
   */
  isAvailable(): boolean {
    return this.queue !== null;
  }

  /**
   * Get the queue for worker to process.
   */
  getQueue(): Queue | null {
    return this.queue;
  }

  /**
   * Get the queue name.
   */
  getQueueName(): string {
    return QUEUE_NAME;
  }

  /**
   * Close connections.
   */
  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    // Don't close shared Redis client here
    this.redis = null;
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate cron pattern with minimum interval enforcement.
   */
  validatePattern(
    type: 'incremental' | 'full',
    pattern: string
  ): { valid: boolean; error?: string } {
    try {
      const parsed = CronExpressionParser.parse(pattern);
      const next = parsed.next().toDate();
      const nextNext = parsed.next().toDate();
      const intervalMs = nextNext.getTime() - next.getTime();

      if (type === 'full' && intervalMs < MIN_FULL_SYNC_INTERVAL_MS) {
        return {
          valid: false,
          error: `Full sync cannot run more often than every 6 hours. Pattern interval: ${Math.round(intervalMs / 60000)} minutes`,
        };
      }

      if (type === 'incremental' && intervalMs < MIN_INCREMENTAL_INTERVAL_MS) {
        return {
          valid: false,
          error: `Incremental sync cannot run more often than every 5 minutes. Pattern interval: ${Math.round(intervalMs / 60000)} minutes`,
        };
      }

      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: `Invalid cron expression: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getSchedulerId(mappingId: string): string {
    return `sync-schedule-${mappingId}`;
  }

  private getMappingIdFromScheduler(key: string): string | null {
    const match = key.match(/sync-schedule-(.+)/);
    return match ? (match[1] ?? null) : null;
  }

  private schedulerToInfo(
    scheduler: BullMQScheduler,
    mappingId: string,
    mappingName: string,
    config: ScheduleConfig | undefined,
    extras: {
      lastStatus: 'success' | 'partial' | 'failed' | null;
      lastDurationMs: number | null;
      lastRecordCount: number | null;
      consecutiveFailures: number;
    }
  ): SchedulerInfo {
    const pattern = scheduler.pattern ?? '';
    const timezone = scheduler.tz ?? config?.timezone ?? 'UTC';
    const nextRuns = this.getNextRuns(pattern, timezone, 5);

    return {
      id: scheduler.key,
      mappingId,
      mappingName,
      type: config?.type ?? 'incremental',
      pattern,
      patternHuman: this.patternToHuman(pattern),
      timezone,
      enabled: true, // If scheduler exists, it's enabled
      nextRun: scheduler.next
        ? new Date(scheduler.next).toISOString()
        : null,
      nextRuns,
      lastRun: null, // Would need to track separately
      lastStatus: extras.lastStatus,
      lastDurationMs: extras.lastDurationMs,
      lastRecordCount: extras.lastRecordCount,
      consecutiveFailures: extras.consecutiveFailures,
    };
  }

  /**
   * Get next N run times for a cron pattern.
   */
  private getNextRuns(
    pattern: string,
    timezone: string,
    count: number
  ): string[] {
    try {
      const parsed = CronExpressionParser.parse(pattern, { tz: timezone });
      const runs: string[] = [];

      for (let i = 0; i < count; i++) {
        const nextDate = parsed.next();
        if (nextDate) {
          const isoString = nextDate.toISOString();
          if (isoString) {
            runs.push(isoString);
          }
        }
      }

      return runs;
    } catch {
      return [];
    }
  }

  /**
   * Convert cron pattern to human-readable string.
   */
  patternToHuman(pattern: string): string {
    const presets: Record<string, string> = {
      '*/5 * * * *': 'Every 5 minutes',
      '*/10 * * * *': 'Every 10 minutes',
      '*/15 * * * *': 'Every 15 minutes',
      '*/30 * * * *': 'Every 30 minutes',
      '0 * * * *': 'Every hour',
      '0 */2 * * *': 'Every 2 hours',
      '0 */4 * * *': 'Every 4 hours',
      '0 */6 * * *': 'Every 6 hours',
      '0 */12 * * *': 'Every 12 hours',
      '0 0 * * *': 'Daily at midnight',
      '0 3 * * *': 'Daily at 3 AM',
      '0 0 * * 0': 'Weekly on Sunday at midnight',
      '0 2 * * 0': 'Weekly on Sunday at 2 AM',
      '0 0 1 * *': 'Monthly on the 1st at midnight',
    };

    if (presets[pattern]) {
      return presets[pattern];
    }

    // Try to parse and describe
    try {
      const parts = pattern.split(' ');
      if (parts.length !== 5) {
        return pattern;
      }

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // Every N minutes
      if (
        minute?.startsWith('*/') &&
        hour === '*' &&
        dayOfMonth === '*' &&
        month === '*' &&
        dayOfWeek === '*'
      ) {
        return `Every ${minute.slice(2)} minutes`;
      }

      // Every N hours
      if (
        minute === '0' &&
        hour?.startsWith('*/') &&
        dayOfMonth === '*' &&
        month === '*' &&
        dayOfWeek === '*'
      ) {
        return `Every ${hour.slice(2)} hours`;
      }

      // Hourly at specific minute
      if (
        minute &&
        minute !== '*' &&
        hour === '*' &&
        dayOfMonth === '*' &&
        month === '*' &&
        dayOfWeek === '*'
      ) {
        return `Every hour at :${minute.padStart(2, '0')}`;
      }

      // Daily at specific time
      if (
        minute &&
        minute !== '*' &&
        hour !== '*' &&
        !hour?.includes('/') &&
        dayOfMonth === '*' &&
        month === '*' &&
        dayOfWeek === '*'
      ) {
        return `Daily at ${hour}:${minute.padStart(2, '0')}`;
      }

      return pattern;
    } catch {
      return pattern;
    }
  }
}

// Singleton instance
let schedulerServiceInstance: SchedulerService | null = null;

export function getSchedulerService(): SchedulerService {
  if (!schedulerServiceInstance) {
    schedulerServiceInstance = new SchedulerService();
  }
  return schedulerServiceInstance;
}
