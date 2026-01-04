import { NextResponse } from 'next/server'
import { isShopifyConfigured } from '@/lib/shopify/client'
import {
  BULK_OPERATION_QUERY,
  isSyncInProgress,
  createSyncRun,
  cleanupOrphanedRuns,
} from '@/lib/shopify/sync'

// ============================================================================
// Cron Security
// ============================================================================

function verifyCronRequest(request: Request): boolean {
  // Check Vercel cron header first
  if (request.headers.get('x-vercel-cron') === '1') {
    return true
  }

  // Fallback to CRON_SECRET for manual testing
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true
  }

  return false
}

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
// GET /api/cron/shopify-sync
// Triggered by Vercel Cron every 6 hours
// ============================================================================

export async function GET(request: Request) {
  // Security: Verify this is a cron request (skip in dev for testing)
  if (process.env.NODE_ENV === 'production' && !verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check Shopify is configured
  if (!isShopifyConfigured()) {
    return NextResponse.json(
      { error: 'Shopify not configured' },
      { status: 400 }
    )
  }

  try {
    // Clean up any orphaned runs (started > 30 min ago, still 'started')
    await cleanupOrphanedRuns()

    // Check if sync is already in progress (DB lease + Shopify check)
    const { inProgress, reason } = await isSyncInProgress(shopifyGraphQL)

    if (inProgress) {
      return NextResponse.json({
        success: false,
        status: 'skipped',
        message: reason || 'Sync already in progress',
      })
    }

    // Start bulk operation
    const result = await shopifyGraphQL(BULK_OPERATION_QUERY)

    if (result.error) {
      return NextResponse.json(
        { error: `Failed to start bulk operation: ${result.error}` },
        { status: 500 }
      )
    }

    const bulkResult = result.data as {
      bulkOperationRunQuery?: {
        bulkOperation?: { id: string; status: string }
        userErrors?: Array<{ field: string; message: string }>
      }
    }

    // Check for user errors
    if (bulkResult?.bulkOperationRunQuery?.userErrors?.length) {
      const errorMsg = bulkResult.bulkOperationRunQuery.userErrors[0].message
      return NextResponse.json(
        { error: `Shopify error: ${errorMsg}` },
        { status: 400 }
      )
    }

    const operationId = bulkResult?.bulkOperationRunQuery?.bulkOperation?.id

    if (!operationId) {
      return NextResponse.json(
        { error: 'No operation ID returned from Shopify' },
        { status: 500 }
      )
    }

    // Create sync run record
    const runId = await createSyncRun('scheduled', operationId)

    // Return immediately - webhook will handle completion
    return NextResponse.json({
      success: true,
      status: 'started',
      operationId,
      runId: runId.toString(),
      message: 'Bulk operation started. Webhook will process results when complete.',
    })
  } catch (error) {
    console.error('Cron sync error:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
