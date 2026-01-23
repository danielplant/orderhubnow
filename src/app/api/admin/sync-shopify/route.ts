import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import {
  isSyncInProgress,
  createSyncRun,
  cleanupOrphanedRuns,
  getLatestSyncRun,
  buildBulkOperationQuery,
  clearProductDataCache,
} from '@/lib/shopify/sync'
import { getStatusCascadeConfig } from '@/lib/data/queries/sync-config'

// ============================================================================
// Shopify API Helper
// ============================================================================

async function shopifyFetch(query: string): Promise<{ data?: unknown; error?: string }> {
  const { SHOPIFY_ACCESS_TOKEN, SHOPIFY_STORE_DOMAIN, SHOPIFY_API_VERSION } = process.env

  if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
    return { error: 'Missing Shopify credentials' }
  }

  const endpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION || '2024-01'}/graphql.json`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      return { error: `Shopify API error: ${response.status} ${response.statusText}` }
    }

    const json = await response.json()
    return { data: json.data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ============================================================================
// GET /api/admin/sync-shopify - Get sync status
// ============================================================================

export async function GET() {
  // Verify admin auth
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get latest sync run
    const latestRun = await getLatestSyncRun()

    // Check if sync is currently in progress
    const { inProgress, reason } = await isSyncInProgress(shopifyFetch)

    return NextResponse.json({
      latestRun,
      inProgress,
      reason,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get sync status' },
      { status: 500 }
    )
  }
}

// ============================================================================
// POST /api/admin/sync-shopify - Trigger a sync
// ============================================================================

export async function POST() {
  // Verify admin auth
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Clean up any orphaned runs
    await cleanupOrphanedRuns()

    // Clear product data cache from previous sync
    clearProductDataCache()

    // Check if sync is already in progress
    const { inProgress, reason } = await isSyncInProgress(shopifyFetch)
    if (inProgress) {
      return NextResponse.json(
        { error: 'Sync already in progress', reason },
        { status: 409 }
      )
    }

    // Get cascade config to determine which product statuses to fetch
    const cascadeConfig = await getStatusCascadeConfig('Product')
    console.log(`[Admin Sync] Ingestion filter: ${JSON.stringify(cascadeConfig.ingestionAllowed)}`)

    // Build dynamic query with status filter
    const bulkOperationQuery = buildBulkOperationQuery(cascadeConfig.ingestionAllowed)

    // Start the bulk operation
    const result = await shopifyFetch(bulkOperationQuery)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    const data = result.data as {
      bulkOperationRunQuery?: {
        bulkOperation?: { id: string; status: string }
        userErrors?: Array<{ field: string; message: string }>
      }
    }

    const bulkOp = data?.bulkOperationRunQuery?.bulkOperation
    const userErrors = data?.bulkOperationRunQuery?.userErrors

    if (userErrors && userErrors.length > 0) {
      return NextResponse.json(
        { error: 'Shopify error', details: userErrors },
        { status: 400 }
      )
    }

    if (!bulkOp?.id) {
      return NextResponse.json(
        { error: 'Failed to start bulk operation' },
        { status: 500 }
      )
    }

    // Create sync run record
    const runId = await createSyncRun('on-demand', bulkOp.id)

    return NextResponse.json({
      success: true,
      message: 'Sync started. Results will be processed when Shopify sends webhook.',
      operationId: bulkOp.id,
      status: bulkOp.status,
      runId: runId.toString(),
    })
  } catch (err) {
    console.error('Error starting sync:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start sync' },
      { status: 500 }
    )
  }
}
