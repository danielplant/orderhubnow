import { NextResponse } from 'next/server'
import {
  isSyncInProgress,
  createSyncRun,
  completeSyncRun,
  cleanupOrphanedRuns,
  processJsonlStream,
  transformToSkuTable,
  BULK_OPERATION_QUERY,
} from '@/lib/shopify/sync'

// ============================================================================
// Cron Security
// ============================================================================

function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // In development, allow unsigned requests
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  if (!cronSecret) {
    console.warn('CRON_SECRET not configured')
    return false
  }

  // Check Bearer token
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    return token === cronSecret
  }

  return false
}

// ============================================================================
// Shopify API Helper
// ============================================================================

async function shopifyFetch(query: string, variables?: Record<string, unknown>): Promise<{ data?: unknown; error?: string }> {
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
      body: JSON.stringify({ query, variables }),
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

// Poll for bulk operation completion (like .NET does)
async function pollForCompletion(operationId: string, maxWaitMs = 300000): Promise<{ url: string; objectCount: number } | { error: string }> {
  const startTime = Date.now()
  const pollInterval = 5000 // 5 seconds
  
  const statusQuery = `
    query($id: ID!) {
      node(id: $id) {
        ... on BulkOperation {
          id
          status
          errorCode
          objectCount
          url
        }
      }
    }
  `
  
  while (Date.now() - startTime < maxWaitMs) {
    const result = await shopifyFetch(statusQuery, { id: operationId })
    
    if (result.error) {
      return { error: result.error }
    }
    
    const op = (result.data as { node?: { status: string; url?: string; objectCount?: number; errorCode?: string } })?.node
    
    if (!op) {
      return { error: 'Bulk operation not found' }
    }
    
    console.log(`Poll: status=${op.status}, objectCount=${op.objectCount || 0}`)
    
    if (op.status === 'COMPLETED') {
      if (!op.url) {
        return { error: 'Completed but no URL' }
      }
      return { url: op.url, objectCount: op.objectCount || 0 }
    }
    
    if (op.status === 'FAILED') {
      return { error: `Bulk operation failed: ${op.errorCode || 'unknown'}` }
    }
    
    if (op.status === 'CANCELED') {
      return { error: 'Bulk operation was canceled' }
    }
    
    // Still running, wait and poll again
    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }
  
  return { error: 'Timeout waiting for bulk operation' }
}

// ============================================================================
// GET /api/cron/shopify-sync - Full sync: trigger, poll, download, transform
// Like .NET - no webhook, just poll until complete
// ============================================================================

export async function GET(request: Request) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let operationId: string | undefined
  let runId: number | undefined

  try {
    console.log('Sync: Starting full Shopify sync (poll mode)')

    // Clean up any orphaned runs
    await cleanupOrphanedRuns()

    // Check if sync is already in progress
    const { inProgress, reason } = await isSyncInProgress(shopifyFetch)
    if (inProgress) {
      console.log(`Sync: Skipped - ${reason}`)
      return NextResponse.json({
        success: false,
        message: 'Sync already in progress',
        reason,
      })
    }

    // Step 1: Start the bulk operation (variant-rooted query - all variants)
    console.log('Step 1: Triggering bulk operation (all variants)...')
    const result = await shopifyFetch(BULK_OPERATION_QUERY)

    if (result.error) {
      console.error('Sync: Failed to start bulk operation:', result.error)
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
      console.error('Sync: Shopify user errors:', userErrors)
      return NextResponse.json({ error: 'Shopify error', details: userErrors }, { status: 400 })
    }

    if (!bulkOp?.id) {
      return NextResponse.json({ error: 'Failed to start bulk operation' }, { status: 500 })
    }

    operationId = bulkOp.id
    runId = Number(await createSyncRun('scheduled', 'product', operationId))
    console.log(`Step 1: Bulk operation started - operationId=${operationId}, runId=${runId}`)

    // Step 2: Poll until complete
    console.log('Step 2: Polling for completion...')
    const pollResult = await pollForCompletion(operationId)
    
    if ('error' in pollResult) {
      await completeSyncRun(operationId, 'failed', 0, pollResult.error)
      return NextResponse.json({ error: pollResult.error }, { status: 500 })
    }
    
    console.log(`Step 2: Complete - ${pollResult.objectCount} objects, URL obtained`)

    // Step 3: Download and process JSONL
    console.log('Step 3: Downloading and processing variants...')
    const jsonlResponse = await fetch(pollResult.url)
    if (!jsonlResponse.ok) {
      throw new Error(`Failed to download JSONL: ${jsonlResponse.status}`)
    }
    const processResult = await processJsonlStream(jsonlResponse, (n) => console.log(`Processed ${n} variants...`))
    console.log(`Step 3: Processed ${processResult.processed} variants`)

    // Step 4: Transform to Sku table
    console.log('Step 4: Transforming to Sku table...')
    const transformResult = await transformToSkuTable()
    console.log(`Step 4: Transform complete - ${transformResult.processed} SKUs`)

    // Mark sync as complete
    await completeSyncRun(operationId, 'completed', transformResult.processed)

    console.log('Sync: SUCCESS')
    return NextResponse.json({
      success: true,
      message: 'Sync completed',
      operationId,
      runId: runId?.toString(),
      variantsProcessed: processResult.processed,
      skusCreated: transformResult.processed,
    })
  } catch (err) {
    console.error('Sync: Error:', err)
    if (operationId) {
      await completeSyncRun(operationId, 'failed', 0, err instanceof Error ? err.message : 'Unknown error')
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sync' },
      { status: 500 }
    )
  }
}
