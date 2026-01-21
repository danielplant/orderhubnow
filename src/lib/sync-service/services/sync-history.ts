/**
 * Sync History Service - Prisma-based sync activity logging
 *
 * Stores sync run history in the SyncRun table with automatic cleanup.
 */

import { prisma } from '@/lib/prisma';
import type {
  SyncHistoryEntry,
  SyncHistoryList,
  SyncStats,
  SyncDuration,
  SyncStatus,
} from '../types/sync';

// ============================================================================
// Constants
// ============================================================================

const MAX_ENTRIES = 1000;
const MAX_ERRORS_PER_ENTRY = 50;

// ============================================================================
// Sync History Service
// ============================================================================

export class SyncHistoryService {
  /**
   * Create a new history entry (typically when starting a sync).
   * Returns the generated ID.
   */
  async create(
    entry: Omit<SyncHistoryEntry, 'id'>
  ): Promise<string> {
    // Limit errors array size
    const limitedErrors = entry.errors.slice(0, MAX_ERRORS_PER_ENTRY);

    const record = await prisma.syncRun.create({
      data: {
        mappingId: entry.mappingId,
        syncType: entry.type,
        status: entry.status,
        triggeredBy: entry.triggeredBy ?? 'manual',
        startedAt: new Date(entry.startedAt),
        completedAt: entry.completedAt ? new Date(entry.completedAt) : null,
        recordsFetched: entry.stats.fetched,
        recordsWritten: entry.stats.inserted + entry.stats.updated,
        recordsSkipped: entry.stats.skipped,
        recordsFailed: entry.stats.failed,
        durationMs: entry.duration?.totalMs ?? null,
        errorMessage: limitedErrors.length > 0 ? limitedErrors.join('\n') : null,
        metadata: JSON.stringify({
          dryRun: entry.dryRun,
          mappingName: entry.mappingName,
          stats: entry.stats,
          duration: entry.duration,
        }),
      },
    });

    // FIFO cleanup - delete old entries if over limit
    await this.cleanupOldEntries();

    return record.id;
  }

  /**
   * Update an existing history entry.
   */
  async update(
    id: string,
    updates: Partial<Omit<SyncHistoryEntry, 'id' | 'mappingId' | 'type' | 'startedAt'>>
  ): Promise<boolean> {
    try {
      // Get existing record for metadata merge
      const existing = await prisma.syncRun.findUnique({
        where: { id },
      });

      if (!existing) {
        return false;
      }

      // Parse existing metadata
      let metadata: Record<string, unknown> = {};
      try {
        if (existing.metadata) {
          metadata = JSON.parse(existing.metadata);
        }
      } catch {
        // Invalid JSON, start fresh
      }

      // Merge updates into metadata
      if (updates.dryRun !== undefined) {
        metadata.dryRun = updates.dryRun;
      }
      if (updates.mappingName !== undefined) {
        metadata.mappingName = updates.mappingName;
      }
      if (updates.stats !== undefined) {
        metadata.stats = updates.stats;
      }
      if (updates.duration !== undefined) {
        metadata.duration = updates.duration;
      }

      // Limit errors
      const errors = updates.errors?.slice(0, MAX_ERRORS_PER_ENTRY) ?? [];

      await prisma.syncRun.update({
        where: { id },
        data: {
          status: updates.status,
          completedAt: updates.completedAt ? new Date(updates.completedAt) : undefined,
          recordsFetched: updates.stats?.fetched,
          recordsWritten: updates.stats ? updates.stats.inserted + updates.stats.updated : undefined,
          recordsSkipped: updates.stats?.skipped,
          recordsFailed: updates.stats?.failed,
          durationMs: updates.duration?.totalMs,
          errorMessage: errors.length > 0 ? errors.join('\n') : undefined,
          metadata: JSON.stringify(metadata),
        },
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a specific history entry.
   */
  async get(id: string): Promise<SyncHistoryEntry | null> {
    const record = await prisma.syncRun.findUnique({
      where: { id },
      include: { mapping: true },
    });

    if (!record) {
      return null;
    }

    return this.toHistoryEntry(record);
  }

  /**
   * Get recent history entries.
   */
  async getRecent(
    limit: number = 50,
    mappingId?: string
  ): Promise<SyncHistoryList> {
    const where = mappingId ? { mappingId } : {};

    const [entries, total] = await Promise.all([
      prisma.syncRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        include: { mapping: true },
      }),
      prisma.syncRun.count({ where }),
    ]);

    return {
      entries: entries.map(this.toHistoryEntry),
      total,
      hasMore: total > limit,
    };
  }

  /**
   * Get entries by status.
   */
  async getByStatus(
    status: SyncStatus,
    limit: number = 50
  ): Promise<SyncHistoryEntry[]> {
    const records = await prisma.syncRun.findMany({
      where: { status },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { mapping: true },
    });

    return records.map(this.toHistoryEntry);
  }

  /**
   * Get the last entry for a mapping.
   */
  async getLastForMapping(mappingId: string): Promise<SyncHistoryEntry | null> {
    const record = await prisma.syncRun.findFirst({
      where: { mappingId },
      orderBy: { startedAt: 'desc' },
      include: { mapping: true },
    });

    if (!record) {
      return null;
    }

    return this.toHistoryEntry(record);
  }

  /**
   * Check if there's a running sync for a mapping.
   */
  async hasRunningSync(mappingId: string): Promise<SyncHistoryEntry | null> {
    const record = await prisma.syncRun.findFirst({
      where: {
        mappingId,
        status: 'running',
      },
      include: { mapping: true },
    });

    if (!record) {
      return null;
    }

    return this.toHistoryEntry(record);
  }

  /**
   * Mark all running syncs as failed (for recovery after crash).
   */
  async recoverStaleSyncs(): Promise<number> {
    const result = await prisma.syncRun.updateMany({
      where: { status: 'running' },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Sync interrupted (server restart or crash)',
      },
    });

    return result.count;
  }

  /**
   * Get statistics summary.
   */
  async getStats(): Promise<{
    totalSyncs: number;
    last24Hours: {
      total: number;
      successful: number;
      failed: number;
    };
    byMapping: Array<{
      mappingId: string;
      total: number;
      lastStatus: string;
      lastRun: string;
    }>;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalSyncs, last24HoursAll, last24HoursSuccess, last24HoursFailed, byMappingRaw] = await Promise.all([
      prisma.syncRun.count(),
      prisma.syncRun.count({
        where: { startedAt: { gte: oneDayAgo } },
      }),
      prisma.syncRun.count({
        where: {
          startedAt: { gte: oneDayAgo },
          status: 'completed',
        },
      }),
      prisma.syncRun.count({
        where: {
          startedAt: { gte: oneDayAgo },
          status: 'failed',
        },
      }),
      prisma.syncRun.groupBy({
        by: ['mappingId'],
        _count: true,
        orderBy: { _count: { mappingId: 'desc' } },
      }),
    ]);

    // Get last run for each mapping
    const byMapping = await Promise.all(
      byMappingRaw
        .filter((m): m is typeof m & { mappingId: string } => m.mappingId !== null)
        .map(async (m) => {
          const lastRun = await prisma.syncRun.findFirst({
            where: { mappingId: m.mappingId },
            orderBy: { startedAt: 'desc' },
          });

          return {
            mappingId: m.mappingId,
            total: m._count,
            lastStatus: lastRun?.status ?? 'unknown',
            lastRun: lastRun?.startedAt.toISOString() ?? '',
          };
        })
    );

    return {
      totalSyncs,
      last24Hours: {
        total: last24HoursAll,
        successful: last24HoursSuccess,
        failed: last24HoursFailed,
      },
      byMapping,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Convert a Prisma record to SyncHistoryEntry.
   */
  private toHistoryEntry(record: {
    id: string;
    mappingId: string | null;
    syncType: string;
    status: string;
    triggeredBy: string | null;
    startedAt: Date;
    completedAt: Date | null;
    recordsFetched: number | null;
    recordsWritten: number | null;
    recordsSkipped: number | null;
    recordsFailed: number | null;
    durationMs: number | null;
    errorMessage: string | null;
    metadata: string | null;
    mapping?: { name: string } | null;
  }): SyncHistoryEntry {
    // Parse metadata
    let metadata: Record<string, unknown> = {};
    try {
      if (record.metadata) {
        metadata = JSON.parse(record.metadata);
      }
    } catch {
      // Invalid JSON
    }

    // Build stats from record fields or metadata
    const stats: SyncStats = (metadata.stats as SyncStats) ?? {
      fetched: record.recordsFetched ?? 0,
      filtered: 0,
      inserted: 0,
      updated: record.recordsWritten ?? 0,
      deleted: 0,
      skipped: record.recordsSkipped ?? 0,
      failed: record.recordsFailed ?? 0,
    };

    // Build duration from record field or metadata
    const duration: SyncDuration | undefined = (metadata.duration as SyncDuration) ?? (
      record.durationMs
        ? {
            totalMs: record.durationMs,
            fetchMs: 0,
            transformMs: 0,
            writeMs: 0,
          }
        : undefined
    );

    // Parse errors from errorMessage
    const errors = record.errorMessage
      ? record.errorMessage.split('\n').filter(Boolean)
      : [];

    return {
      id: record.id,
      mappingId: record.mappingId ?? '',
      mappingName: record.mapping?.name ?? (metadata.mappingName as string) ?? undefined,
      type: record.syncType as 'full' | 'incremental' | 'webhook',
      status: record.status as SyncStatus,
      triggeredBy: record.triggeredBy ?? undefined,
      dryRun: (metadata.dryRun as boolean) ?? false,
      stats,
      duration,
      errors,
      startedAt: record.startedAt.toISOString(),
      completedAt: record.completedAt?.toISOString(),
    };
  }

  /**
   * Clean up old entries to maintain FIFO limit.
   */
  private async cleanupOldEntries(): Promise<void> {
    const count = await prisma.syncRun.count();

    if (count > MAX_ENTRIES) {
      // Find the oldest entries to delete
      const toDelete = await prisma.syncRun.findMany({
        orderBy: { startedAt: 'asc' },
        take: count - MAX_ENTRIES,
        select: { id: true },
      });

      if (toDelete.length > 0) {
        await prisma.syncRun.deleteMany({
          where: {
            id: { in: toDelete.map((r) => r.id) },
          },
        });
      }
    }
  }
}

// Singleton instance
let syncHistoryServiceInstance: SyncHistoryService | null = null;

export function getSyncHistoryService(): SyncHistoryService {
  if (!syncHistoryServiceInstance) {
    syncHistoryServiceInstance = new SyncHistoryService();
  }
  return syncHistoryServiceInstance;
}
