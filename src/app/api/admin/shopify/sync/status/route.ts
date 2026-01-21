/**
 * Sync Status API Route
 * GET /api/admin/shopify/sync/status - Get current sync status
 */

import { NextResponse } from 'next/server';
import {
  getConfigService,
  getSyncHistoryService,
  getConnector,
  getShopifyConnector,
  isRedisConfigured,
  SyncEngine,
} from '@/lib/sync-service';

// Module-level sync engine reference (lazy initialized)
let syncEngineInstance: SyncEngine | null = null;

async function getSyncEngine(): Promise<SyncEngine | null> {
  if (syncEngineInstance) {
    return syncEngineInstance;
  }

  const configService = getConfigService();
  const config = await configService.load();

  if (!config.database || !config.shopify) {
    return null;
  }

  const dbConnector = await getConnector(config.database.connectionString);
  const shopifyConnector = getShopifyConnector(config.shopify);

  syncEngineInstance = new SyncEngine(shopifyConnector, dbConnector);
  return syncEngineInstance;
}

export async function GET() {
  try {
    const historyService = getSyncHistoryService();
    const configService = getConfigService();
    const config = await configService.load();
    const redisConfigured = await isRedisConfigured();

    // Get running syncs
    const syncEngine = await getSyncEngine();
    const runningSyncs = syncEngine ? syncEngine.listRunningSyncs() : [];

    // Get recent history
    const recentHistory = await historyService.getRecent(10);

    // Get last successful sync
    const successfulRuns = await historyService.getByStatus('completed', 1);
    const lastSuccess = successfulRuns[0] || null;

    return NextResponse.json({
      configured: {
        database: !!config.database?.connectionString,
        shopify: !!config.shopify?.accessToken,
        redis: redisConfigured,
      },
      running: runningSyncs.map((s) => ({
        mappingId: s.mappingId,
        type: s.type,
        startedAt: s.startedAt.toISOString(),
        historyId: s.historyId,
      })),
      recentHistory: recentHistory.entries.slice(0, 5),
      lastSuccessfulSync: lastSuccess
        ? {
            id: lastSuccess.id,
            mappingId: lastSuccess.mappingId,
            mappingName: lastSuccess.mappingName,
            type: lastSuccess.type,
            completedAt: lastSuccess.completedAt,
            recordsWritten: lastSuccess.stats.inserted + lastSuccess.stats.updated,
          }
        : null,
    });
  } catch (error) {
    console.error('[Sync] Error getting status:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get sync status' } },
      { status: 500 }
    );
  }
}
