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
  getSyncHealthStats,
} from '@/lib/shopify/sync'

// ============================================================================
// Shopify GraphQL Helper with Retry Logic
// ============================================================================

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate exponential backoff delay.
 */
function getBackoffDelay(attempt: number, baseDelayMs = 2000): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt)
  const jitter = Math.random() * 500
  return exponentialDelay + jitter
}

/**
 * Check if an error is retryable.
 */
function isRetryableError(status: number, errorMessage?: string): boolean {
  if (!status || status === 0) return true
  if (status === 429) return true
  if (status >= 500 && status < 600) return true
  if (errorMessage && (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNRESET'))) {
    return true
  }
  return false
}

interface GraphQLResult {
  data?: unknown
  error?: string
  retries?: number
}

async function shopifyGraphQL(query: string, maxRetries = 3): Promise<GraphQLResult> {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN!
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN!
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

  let lastError: string | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
        const errorMsg = result.errors[0]?.message || 'GraphQL error'

        // Check if we should retry
        if (attempt < maxRetries && isRetryableError(response.status, errorMsg)) {
          const delay = getBackoffDelay(attempt)
          console.warn(`Shopify GraphQL error (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMsg}. Retrying in ${Math.round(delay)}ms...`)
          await sleep(delay)
          lastError = errorMsg
          continue
        }

        return { error: errorMsg, retries: attempt }
      }

      return { data: result.data, retries: attempt }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Fetch failed'
      lastError = errorMessage

      if (attempt < maxRetries && isRetryableError(0, errorMessage)) {
        const delay = getBackoffDelay(attempt)
        console.warn(`Shopify GraphQL network error (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}. Retrying in ${Math.round(delay)}ms...`)
        await sleep(delay)
        continue
      }

      return { error: errorMessage, retries: attempt }
    }
  }

  return { error: lastError || 'Max retries exceeded', retries: maxRetries }
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

    // Get sync health stats for dashboard widget
    const healthStats = await getSyncHealthStats()

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
      // New: Sync health statistics
      health: {
        isHealthy: healthStats.isHealthy,
        successRate: healthStats.recentSuccessRate,
        lastSuccessfulSync: healthStats.lastSuccessfulSync?.toISOString() ?? null,
        runsLast24h: {
          total: healthStats.totalRunsLast24h,
          successful: healthStats.successfulRunsLast24h,
          failed: healthStats.failedRunsLast24h,
        },
        averageDurationMs: healthStats.averageSyncDurationMs,
        warnings: healthStats.healthWarnings,
      },
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
