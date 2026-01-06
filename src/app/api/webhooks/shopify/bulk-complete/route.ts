import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import {
  completeSyncRun,
  processJsonlStream,
  transformToSkuTable,
  getBulkOperationUrl,
} from '@/lib/shopify/sync'

// ============================================================================
// Webhook Signature Verification
// ============================================================================

function verifyWebhookSignature(body: string, signature: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET

  // In development, allow unsigned requests for testing
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  // If no secret configured, allow webhook (bulk operation webhooks registered via API
  // don't have a signing secret - only app-installed webhooks do)
  if (!secret) {
    console.log('SHOPIFY_WEBHOOK_SECRET not configured - allowing webhook')
    return true
  }

  if (!signature) {
    console.warn('Webhook verification failed: missing signature')
    return false
  }

  try {
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64')

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature))
  } catch (err) {
    console.error('Webhook signature verification error:', err)
    return false
  }
}

// ============================================================================
// POST /api/webhooks/shopify/bulk-complete
// Called by Shopify when a bulk operation completes
// ============================================================================

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-shopify-hmac-sha256')

  // Verify webhook signature
  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Track operationId outside try block for error handling
  let operationId: string | undefined

  try {
    const payload = JSON.parse(body)

    // Shopify bulk operation webhook payload structure:
    // {
    //   admin_graphql_api_id: "gid://shopify/BulkOperation/123",
    //   status: "completed" | "failed" | "canceled",
    //   type: "query" | "mutation",
    //   url: "https://storage.shopifycdn.com/..." (only if completed),
    //   error_code: "..." (only if failed),
    //   object_count: 1234,
    //   completed_at: "2024-01-01T00:00:00Z"
    // }
    const rawOperationId = payload.admin_graphql_api_id
    const { status, url, error_code: errorCode, object_count: objectCount } = payload

    // Validate operationId is present
    if (!rawOperationId || typeof rawOperationId !== 'string') {
      console.warn('Webhook received without valid operation ID')
      return NextResponse.json({
        received: true,
        status: 'invalid_payload',
        message: 'Missing or invalid admin_graphql_api_id',
      })
    }

    // After validation, assign to outer variable for error handling
    // and use const for type narrowing within try block
    operationId = rawOperationId
    const opId: string = rawOperationId

    console.log(`Webhook received: operation=${opId}, status=${status}`)

    // Idempotency check: Find the run and check if already processed
    const existingRun = await prisma.shopifySyncRun.findFirst({
      where: { OperationId: opId },
    })

    if (!existingRun) {
      // No matching run found - this might be from an old operation or different source
      console.warn(`No sync run found for operation: ${opId}`)
      return NextResponse.json({
        received: true,
        status: 'no_matching_run',
        message: 'No sync run record found for this operation',
      })
    }

    if (existingRun.Status === 'completed') {
      // Already processed - idempotency guard
      console.log(`Operation ${opId} already processed, skipping`)
      return NextResponse.json({
        received: true,
        status: 'already_processed',
        itemCount: existingRun.ItemCount,
      })
    }

    // Handle non-completed statuses
    if (status !== 'completed') {
      const errorStatus = status === 'failed' ? 'failed' : 'cancelled'
      await completeSyncRun(opId, errorStatus, undefined, errorCode || `Status: ${status}`)

      console.log(`Operation ${opId} ended with status: ${errorStatus}`)
      return NextResponse.json({
        received: true,
        status: errorStatus,
        error: errorCode,
      })
    }

    // Get download URL from Shopify (webhook doesn't include it)
    // We need to query the bulk operation to get the actual URL
    let downloadUrl = url
    if (!downloadUrl) {
      console.log('No URL in webhook payload, fetching from Shopify API...')
      const opDetails = await getBulkOperationUrl(opId)
      if (!opDetails?.url) {
        await completeSyncRun(opId, 'failed', 0, 'Could not retrieve result URL from Shopify')
        return NextResponse.json({
          received: true,
          status: 'failed',
          error: 'Could not retrieve result URL',
        })
      }
      downloadUrl = opDetails.url
      console.log(`Retrieved URL from Shopify API: ${downloadUrl.substring(0, 80)}...`)
    }

    console.log(`Downloading and streaming bulk operation results...`)

    const dataResponse = await fetch(downloadUrl)
    if (!dataResponse.ok) {
      const errorMsg = `Failed to download results: HTTP ${dataResponse.status}`
      await completeSyncRun(opId, 'failed', 0, errorMsg)
      return NextResponse.json({
        received: true,
        status: 'failed',
        error: errorMsg,
      })
    }

    // Stream and process the JSONL data to avoid loading entire file into memory
    const { processed, errors } = await processJsonlStream(dataResponse, (count) => {
      console.log(`Processed ${count} variants...`)
    })

    console.log(`JSONL processing complete: ${processed} items, ${errors} errors`)

    // Transform: RawSkusFromShopify → Sku table
    // This is the TypeScript equivalent of .NET's TransformShopifySkus stored procedure
    console.log('Starting transform to Sku table...')
    const transformResult = await transformToSkuTable()
    console.log(
      `Transform complete: ${transformResult.processed} processed, ${transformResult.errors} errors, ${transformResult.skipped} skipped`
    )

    // Mark run as completed
    await completeSyncRun(opId, 'completed', processed)

    console.log(`Sync complete: ${processed} items processed, ${errors} errors`)

    return NextResponse.json({
      received: true,
      status: 'processed',
      itemCount: processed,
      errorCount: errors,
      shopifyObjectCount: objectCount,
      transform: {
        processed: transformResult.processed,
        errors: transformResult.errors,
        skipped: transformResult.skipped,
      },
    })
  } catch (error) {
    console.error('Webhook processing error:', error)

    // Mark the run as failed if we have an operationId
    if (operationId) {
      try {
        await completeSyncRun(
          operationId,
          'failed',
          0,
          error instanceof Error ? error.message : 'Unknown processing error'
        )
      } catch (updateError) {
        console.error('Failed to update sync run status:', updateError)
      }
    }

    return NextResponse.json(
      {
        received: true,
        status: 'error',
        error: error instanceof Error ? error.message : 'Processing failed',
      },
      { status: 500 }
    )
  }
}
