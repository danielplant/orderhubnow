import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import {
  isSyncInProgress,
  createSyncRun,
  cleanupOrphanedRuns,
  getLatestSyncRun,
  BULK_OPERATION_QUERY,
} from '@/lib/shopify/sync'

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

    // Check if sync is already in progress
    const { inProgress, reason } = await isSyncInProgress(shopifyFetch)
    if (inProgress) {
      return NextResponse.json(
        { error: 'Sync already in progress', reason },
        { status: 409 }
      )
    }

    // Start the bulk operation (variant-rooted query - all variants)
    console.log('[Admin Sync] Starting bulk operation (all variants)')
    const result = await shopifyFetch(BULK_OPERATION_QUERY)

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
    const runId = await createSyncRun('on-demand', 'product', bulkOp.id)

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

// ============================================================================
// DELETE /api/admin/sync-shopify - Cancel stuck sync
// ============================================================================

export async function DELETE() {
  // Verify admin auth
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Find all stuck runs
    const stuckRuns = await prisma.shopifySyncRun.findMany({
      where: { Status: 'started' },
    })

    // 2. Mark them as cancelled
    const dbResult = await prisma.shopifySyncRun.updateMany({
      where: { Status: 'started' },
      data: {
        Status: 'cancelled',
        CompletedAt: new Date(),
        ErrorMessage: 'Manually cancelled by admin',
      },
    })

    // 3. Try to cancel Shopify bulk operation
    let shopifyCancelled = false
    const cancelMutation = `
      mutation {
        bulkOperationCancel {
          bulkOperation { id status }
          userErrors { field message }
        }
      }
    `
    const cancelResult = await shopifyFetch(cancelMutation)
    if (!cancelResult.error) {
      shopifyCancelled = true
    }

    return NextResponse.json({
      success: true,
      message: `Cancelled ${dbResult.count} stuck sync(s)`,
      stuckRunIds: stuckRuns.map(r => r.ID.toString()),
      shopifyCancelled,
      shopifyError: cancelResult.error,
    })
  } catch (err) {
    console.error('Error cancelling sync:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to cancel sync' },
      { status: 500 }
    )
  }
}
