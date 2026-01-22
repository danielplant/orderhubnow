import { NextResponse } from 'next/server'
import { syncAllPendingFulfillments } from '@/lib/data/actions/fulfillment-sync'
import { isShopifyConfigured } from '@/lib/shopify/client'

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
// GET /api/cron/fulfillment-sync
// Sync fulfillments from Shopify for all pending orders
// ============================================================================

/**
 * Fulfillment Back-Sync Cron Job
 * 
 * Pulls fulfillment data (tracking numbers, shipped line items) from Shopify
 * for orders that were transferred from OHN.
 * 
 * Query params:
 * - days: Only sync orders from last N days (default: 90)
 * - limit: Max orders to sync per run (default: 50)
 * 
 * Usage:
 * - Vercel cron: Add to vercel.json crons config
 * - Manual trigger: GET /api/cron/fulfillment-sync (dev) or with Bearer token (prod)
 */
export async function GET(request: Request) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check Shopify configuration
  if (!isShopifyConfigured()) {
    return NextResponse.json(
      { error: 'Shopify is not configured' },
      { status: 400 }
    )
  }

  try {
    const url = new URL(request.url)
    const days = parseInt(url.searchParams.get('days') || '90')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    console.log(`[fulfillment-sync] Starting sync: days=${days}, limit=${limit}`)

    const result = await syncAllPendingFulfillments({
      transferredWithinDays: days,
      limit,
    })

    console.log(
      `[fulfillment-sync] Complete: orders=${result.ordersProcessed}, ` +
        `shipments=${result.shipmentsCreated}, errors=${result.errors.length}`
    )

    // Log status sync errors server-side for diagnosis (not in response)
    if (result.statusSyncErrors && result.statusSyncErrors.length > 0) {
      console.warn('[fulfillment-sync] Status sync errors:', result.statusSyncErrors)
    }

    return NextResponse.json({
      success: result.success,
      ordersProcessed: result.ordersProcessed,
      shipmentsCreated: result.shipmentsCreated,
      errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
      // statusSyncErrors intentionally omitted from response - check server logs
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[fulfillment-sync] Error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
