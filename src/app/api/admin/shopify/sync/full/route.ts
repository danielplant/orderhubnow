/**
 * Full Sync API Route
 * POST /api/admin/shopify/sync/full - Start a full sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getConfigService,
  getMappingService,
  getConnector,
  getShopifyConnector,
  SyncEngine,
} from '@/lib/sync-service';

const FullSyncSchema = z.object({
  mappingId: z.string().uuid(),
  dryRun: z.boolean().default(false),
  deleteStale: z.boolean().default(false),
});

// Module-level sync engine cache
let syncEngineInstance: SyncEngine | null = null;

async function getSyncEngine(): Promise<SyncEngine | null> {
  const configService = getConfigService();
  const config = await configService.load();

  if (!config.database || !config.shopify) {
    return null;
  }

  // Recreate if config changed (simple check - in production would need better cache invalidation)
  if (!syncEngineInstance) {
    const dbConnector = await getConnector(config.database.connectionString);
    const shopifyConnector = getShopifyConnector(config.shopify);
    syncEngineInstance = new SyncEngine(shopifyConnector, dbConnector);
  }

  return syncEngineInstance;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = FullSyncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { mappingId, dryRun, deleteStale } = parsed.data;

    // Verify mapping exists
    const mappingService = getMappingService();
    const mapping = await mappingService.getById(mappingId);

    if (!mapping) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found' } },
        { status: 404 }
      );
    }

    // Get sync engine
    const syncEngine = await getSyncEngine();
    if (!syncEngine) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_CONFIGURED',
            message: 'Database and Shopify must be configured before syncing',
          },
        },
        { status: 400 }
      );
    }

    // Check if sync already running for this mapping
    const running = syncEngine.getRunningSync(mappingId);
    if (running) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SYNC_ALREADY_RUNNING',
            message: `A ${running.type} sync is already running for this mapping`,
          },
        },
        { status: 409 }
      );
    }

    console.log(`[Sync] Starting full sync for ${mapping.name} (dryRun: ${dryRun})`);

    // Run sync (non-blocking - returns immediately with historyId)
    // In a real implementation, you'd want to run this in a background job
    const resultPromise = syncEngine.fullSync({
      mappingId,
      dryRun,
      deleteStale,
      onProgress: (progress) => {
        // Progress updates could be stored in Redis or a database for polling
        console.log(`[Sync] Progress: ${progress.phase} - ${progress.recordsFetched} fetched`);
      },
    });

    // For now, we'll await the result (could make this async with job ID)
    const result = await resultPromise;

    console.log(
      `[Sync] Full sync ${result.success ? 'completed' : 'failed'} for ${mapping.name}: ` +
        `${result.stats.inserted} inserted, ${result.stats.updated} updated`
    );

    return NextResponse.json({
      success: result.success,
      historyId: result.historyId,
      stats: result.stats,
      duration: result.duration,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[Sync] Error running full sync:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to run sync',
        },
      },
      { status: 500 }
    );
  }
}
