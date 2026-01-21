/**
 * Webhook Stats Service - Track webhook metrics and history
 *
 * Uses Prisma WebhookHistory table for persistent storage.
 *
 * Features:
 * - Received/processed/failed counts
 * - By-topic breakdown
 * - Recent webhook history
 * - Average processing time
 */

import { prisma } from '@/lib/prisma';
import type { WebhookHistoryEntry, WebhookStats } from '../types/webhook';
import type { QueueStats } from './webhook-queue';

// ============================================================================
// Constants
// ============================================================================

const MAX_HISTORY_ENTRIES = 1000;

// ============================================================================
// WebhookStatsService Class
// ============================================================================

export class WebhookStatsService {
  private getQueueStats: (() => Promise<QueueStats>) | null = null;

  /**
   * Set queue stats getter (injected to avoid circular deps).
   */
  setQueueStatsGetter(getter: () => Promise<QueueStats>): void {
    this.getQueueStats = getter;
  }

  /**
   * Record a processed webhook.
   */
  async recordWebhook(entry: WebhookHistoryEntry): Promise<void> {
    try {
      await prisma.webhookHistory.create({
        data: {
          shopifyWebhookId: entry.webhookId,
          topic: entry.topic,
          shopDomain: entry.shopDomain,
          receivedAt: new Date(entry.receivedAt),
          processedAt: entry.processedAt ? new Date(entry.processedAt) : null,
          status: entry.status,
          mappingsProcessed: entry.mappingsProcessed.length,
          recordsWritten: entry.recordsWritten,
          processingMs: entry.processingMs,
          errorMessage: entry.error ?? null,
        },
      });

      // FIFO cleanup - delete old entries if over limit
      await this.cleanupOldEntries();
    } catch (err) {
      // Log error but don't fail - stats are non-critical
      console.error('[WebhookStats] Error recording webhook:', err);
    }
  }

  /**
   * Get aggregated stats.
   */
  async getStats(): Promise<WebhookStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Get today's stats
      const [todayAll, todayCompleted, todayFailed, todaySkipped] =
        await Promise.all([
          prisma.webhookHistory.count({
            where: { receivedAt: { gte: today } },
          }),
          prisma.webhookHistory.count({
            where: { receivedAt: { gte: today }, status: 'completed' },
          }),
          prisma.webhookHistory.count({
            where: { receivedAt: { gte: today }, status: 'failed' },
          }),
          prisma.webhookHistory.count({
            where: { receivedAt: { gte: today }, status: 'skipped' },
          }),
        ]);

      // Get average processing time for today
      const avgResult = await prisma.webhookHistory.aggregate({
        where: { receivedAt: { gte: today } },
        _avg: { processingMs: true },
      });

      // Get by-topic breakdown (all time)
      const byTopicRaw = await prisma.webhookHistory.groupBy({
        by: ['topic', 'status'],
        _count: true,
      });

      // Organize by-topic data
      const byTopic: Record<
        string,
        { received: number; processed: number; failed: number }
      > = {};

      for (const row of byTopicRaw) {
        if (!byTopic[row.topic]) {
          byTopic[row.topic] = { received: 0, processed: 0, failed: 0 };
        }

        byTopic[row.topic].received += row._count;

        if (row.status === 'completed') {
          byTopic[row.topic].processed += row._count;
        } else if (row.status === 'failed') {
          byTopic[row.topic].failed += row._count;
        }
      }

      // Get queue stats if available
      let queue: QueueStats = { waiting: 0, active: 0, delayed: 0, failed: 0 };
      if (this.getQueueStats) {
        try {
          queue = await this.getQueueStats();
        } catch {
          // Ignore queue stats errors
        }
      }

      return {
        today: {
          received: todayAll,
          processed: todayCompleted,
          failed: todayFailed,
          skipped: todaySkipped,
          avgProcessingMs: Math.round(avgResult._avg.processingMs ?? 0),
        },
        byTopic,
        queue,
      };
    } catch (err) {
      console.error('[WebhookStats] Error getting stats:', err);
      return {
        today: {
          received: 0,
          processed: 0,
          failed: 0,
          skipped: 0,
          avgProcessingMs: 0,
        },
        byTopic: {},
        queue: { waiting: 0, active: 0, delayed: 0, failed: 0 },
      };
    }
  }

  /**
   * Get recent webhook history.
   */
  async getHistory(limit = 100): Promise<WebhookHistoryEntry[]> {
    try {
      const records = await prisma.webhookHistory.findMany({
        orderBy: { receivedAt: 'desc' },
        take: limit,
      });

      return records.map(
        (r): WebhookHistoryEntry => ({
          id: r.id,
          webhookId: r.shopifyWebhookId,
          topic: r.topic,
          shopDomain: r.shopDomain,
          receivedAt: r.receivedAt.toISOString(),
          processedAt: r.processedAt?.toISOString(),
          status: r.status as 'pending' | 'completed' | 'failed' | 'skipped',
          mappingsProcessed: [], // Would need to store this differently to retrieve
          recordsWritten: r.recordsWritten ?? 0,
          error: r.errorMessage ?? undefined,
          processingMs: r.processingMs ?? 0,
        })
      );
    } catch (err) {
      console.error('[WebhookStats] Error getting history:', err);
      return [];
    }
  }

  /**
   * Clean up old entries to maintain FIFO limit.
   */
  private async cleanupOldEntries(): Promise<void> {
    try {
      const count = await prisma.webhookHistory.count();

      if (count > MAX_HISTORY_ENTRIES) {
        // Find the oldest entries to delete
        const toDelete = await prisma.webhookHistory.findMany({
          orderBy: { receivedAt: 'asc' },
          take: count - MAX_HISTORY_ENTRIES,
          select: { id: true },
        });

        if (toDelete.length > 0) {
          await prisma.webhookHistory.deleteMany({
            where: {
              id: { in: toDelete.map((r) => r.id) },
            },
          });
        }
      }
    } catch (err) {
      console.error('[WebhookStats] Error cleaning up old entries:', err);
    }
  }

  /**
   * Clear all stats (for testing).
   */
  async clear(): Promise<void> {
    try {
      await prisma.webhookHistory.deleteMany({});
    } catch (err) {
      console.error('[WebhookStats] Error clearing stats:', err);
    }
  }
}

// Singleton instance
let webhookStatsInstance: WebhookStatsService | null = null;

export function getWebhookStatsService(): WebhookStatsService {
  if (!webhookStatsInstance) {
    webhookStatsInstance = new WebhookStatsService();
  }
  return webhookStatsInstance;
}
