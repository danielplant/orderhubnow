import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getSyncStatus } from '@/lib/data/queries/shopify'
import { isShopifyConfigured } from '@/lib/shopify/client'
import { getLatestSyncRun, runFullSync } from '@/lib/shopify/sync'

// ============================================================================
// GET /api/shopify/sync
// Returns current sync status including run state.
// ============================================================================

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get basic status (products synced, customers synced, etc.)
    const status = await getSyncStatus()

    // Get latest sync run for "in progress" / "last run" info
    const latestRun = await getLatestSyncRun()

    // #region agent log - A: syncInProgress calculation
    const now = new Date().getTime();
    const startedAt = latestRun?.startedAt.getTime() ?? 0;
    const ageMs = now - startedAt;
    const syncInProgress = latestRun?.status === 'started' && ageMs < 15 * 60 * 1000;
    fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:32',message:'GET syncInProgress calc',data:{latestRunStatus:latestRun?.status,ageMs,is15MinCheck:ageMs < 15*60*1000,syncInProgress},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({
      ...status,
      lastRun: latestRun
        ? {
            id: latestRun.id.toString(),
            syncType: latestRun.syncType,
            status: latestRun.status,
            startedAt: latestRun.startedAt.toISOString(),
            completedAt: latestRun.completedAt?.toISOString() ?? null,
            itemCount: latestRun.itemCount,
            errorMessage: latestRun.errorMessage,
            // Progress tracking fields
            currentStep: latestRun.currentStep,
            currentStepDetail: latestRun.currentStepDetail,
            progressPercent: latestRun.progressPercent,
            recordsProcessed: latestRun.recordsProcessed,
            totalRecords: latestRun.totalRecords,
          }
        : null,
      syncInProgress,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================================================
// POST /api/shopify/sync
// Trigger a full sync operation (like .NET - poll until complete).
// This is a long-running request that polls Shopify, downloads, and transforms.
// ============================================================================

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if Shopify is configured
    if (!isShopifyConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Shopify is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN environment variables.',
        },
        { status: 400 }
      )
    }

    // Run the full sync (like .NET: poll until complete, download, transform)
    // This may take several minutes
    console.log('Starting full Shopify sync via API...')
    const result = await runFullSync({
      maxWaitMs: 600000, // 10 minutes max
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        status: 'completed',
        message: result.message,
        operationId: result.operationId,
        variantsProcessed: result.variantsProcessed,
        skusCreated: result.skusCreated,
      })
    } else {
      // Sync failed but didn't throw
      return NextResponse.json(
        {
          success: false,
          status: 'failed',
          message: result.message,
          error: result.error,
          operationId: result.operationId,
        },
        { status: result.message === 'Sync already in progress' ? 409 : 500 }
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Sync error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
