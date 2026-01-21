/**
 * Dashboard Summary API Route
 * GET /api/admin/shopify/sync/dashboard/summary - Get dashboard summary stats
 */

import { NextResponse } from 'next/server';
import {
  getConfigService,
  getMappingService,
  getSyncHistoryService,
  isRedisConfigured,
} from '@/lib/sync-service';
import type { SyncHistoryEntry } from '@/lib/sync-service';

export async function GET() {
  try {
    const configService = getConfigService();
    const mappingService = getMappingService();
    const historyService = getSyncHistoryService();

    const [config, mappings, recentHistory] = await Promise.all([
      configService.load(),
      mappingService.getAll(),
      historyService.getRecent(100),
    ]);

    // Calculate stats from recent history
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentRuns = recentHistory.entries.filter(
      (entry: SyncHistoryEntry) => new Date(entry.startedAt) > last24Hours
    );

    const successfulRuns = recentRuns.filter((r: SyncHistoryEntry) => r.status === 'completed').length;
    const failedRuns = recentRuns.filter((r: SyncHistoryEntry) => r.status === 'failed').length;
    const totalRecordsWritten = recentRuns.reduce(
      (sum: number, r: SyncHistoryEntry) => sum + (r.stats.inserted + r.stats.updated),
      0
    );

    // Configuration status
    const databaseConfigured = !!config.database?.connectionString;
    const shopifyConfigured = !!config.shopify?.accessToken;
    const redisConfigured = await isRedisConfigured();

    // Active mappings
    const activeMappings = mappings.filter((m) => m.webhookEnabled !== false).length;

    return NextResponse.json({
      success: true,
      summary: {
        connections: {
          database: databaseConfigured,
          shopify: shopifyConfigured,
          redis: redisConfigured,
        },
        mappings: {
          total: mappings.length,
          active: activeMappings,
        },
        last24Hours: {
          totalRuns: recentRuns.length,
          successful: successfulRuns,
          failed: failedRuns,
          recordsWritten: totalRecordsWritten,
        },
        lastSync: recentHistory.entries[0] || null,
      },
    });
  } catch (error) {
    console.error('[Dashboard] Error getting summary:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get summary' } },
      { status: 500 }
    );
  }
}
