import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getSyncStatus } from '@/lib/data/queries/shopify'
import { isShopifyConfigured } from '@/lib/shopify/client'
import {
  BULK_OPERATION_QUERY,
  isSyncInProgress,
  createSyncRun,
  getLatestSyncRun,
  cleanupOrphanedRuns,
} from '@/lib/shopify/sync'

// ============================================================================
// Shopify GraphQL Helper
// ============================================================================

async function shopifyGraphQL(query: string): Promise<{ data?: unknown; error?: string }> {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN!
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN!
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

  try {
    const response = await fetch(
      `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query }),
      }
    )

    const result = await response.json()

    if (result.errors) {
      return { error: result.errors[0]?.message || 'GraphQL error' }
    }

    return { data: result.data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Fetch failed' }
  }
}

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
          }
        : null,
      syncInProgress:
        latestRun?.status === 'started' &&
        new Date().getTime() - latestRun.startedAt.getTime() < 15 * 60 * 1000,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================================================
// POST /api/shopify/sync
// Trigger an on-demand sync operation.
// Starts a Shopify bulk operation and returns immediately.
// Webhook handles completion.
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

    // Clean up any orphaned runs (started > 30 min ago, still 'started')
    await cleanupOrphanedRuns()

    // Check if sync is already in progress (DB lease + Shopify check)
    const { inProgress, reason, runId } = await isSyncInProgress(shopifyGraphQL)

    if (inProgress) {
      return NextResponse.json({
        success: false,
        status: 'in_progress',
        message: reason || 'A sync is already in progress',
        runId: runId?.toString(),
      })
    }

    // Start bulk operation
    const result = await shopifyGraphQL(BULK_OPERATION_QUERY)

    if (result.error) {
      return NextResponse.json(
        { success: false, error: `Failed to start bulk operation: ${result.error}` },
        { status: 500 }
      )
    }

    const bulkResult = result.data as {
      bulkOperationRunQuery?: {
        bulkOperation?: { id: string; status: string }
        userErrors?: Array<{ field: string; message: string }>
      }
    }

    // Check for Shopify user errors
    if (bulkResult?.bulkOperationRunQuery?.userErrors?.length) {
      const errorMsg = bulkResult.bulkOperationRunQuery.userErrors[0].message
      return NextResponse.json({ success: false, error: `Shopify error: ${errorMsg}` }, { status: 400 })
    }

    const operationId = bulkResult?.bulkOperationRunQuery?.bulkOperation?.id

    if (!operationId) {
      return NextResponse.json(
        { success: false, error: 'No operation ID returned from Shopify' },
        { status: 500 }
      )
    }

    // Create sync run record
    const newRunId = await createSyncRun('on-demand', operationId)

    // Return immediately - webhook will handle completion
    return NextResponse.json({
      success: true,
      status: 'started',
      operationId,
      runId: newRunId.toString(),
      message: 'Sync started. This page will update when complete.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Sync trigger error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
