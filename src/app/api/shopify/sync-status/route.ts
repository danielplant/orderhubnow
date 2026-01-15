import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/providers'
import { syncAllPendingOrderStatuses } from '@/lib/data/actions/shopify'
import { isShopifyConfigured } from '@/lib/shopify/client'

/**
 * POST /api/shopify/sync-status
 * 
 * Syncs order statuses from Shopify back to OHN.
 * Can be triggered by:
 * 1. Admin user manually
 * 2. Vercel cron job (with CRON_SECRET header)
 * 
 * Query params:
 * - minutes: Only sync orders not synced in last N minutes (default: 30)
 * - days: Only sync orders from last N days (default: 30)
 * - limit: Max orders to sync per run (default: 100)
 */
export async function POST(request: Request) {
  try {
    // Check authorization - either admin session or cron secret
    const headersList = await headers()
    const cronSecret = headersList.get('x-cron-secret')
    const expectedSecret = process.env.CRON_SECRET

    // Cron job authorization
    if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
      // Authorized via cron secret
    } else {
      // Check admin session
      const session = await auth()
      if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    if (!isShopifyConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Shopify is not configured' },
        { status: 400 }
      )
    }

    // Parse query params
    const url = new URL(request.url)
    const minutes = parseInt(url.searchParams.get('minutes') || '30')
    const days = parseInt(url.searchParams.get('days') || '30')
    const limit = parseInt(url.searchParams.get('limit') || '100')

    console.log(`[sync-status] Starting bulk sync: minutes=${minutes}, days=${days}, limit=${limit}`)

    const result = await syncAllPendingOrderStatuses({
      syncedMoreThanMinutesAgo: minutes,
      transferredWithinDays: days,
      limit,
    })

    console.log(`[sync-status] Complete: synced=${result.synced}, failed=${result.failed}`)

    return NextResponse.json({
      success: result.success,
      synced: result.synced,
      failed: result.failed,
      errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sync-status] Error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * GET /api/shopify/sync-status
 * 
 * Returns sync status summary - useful for monitoring.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isShopifyConfigured()) {
      return NextResponse.json({ configured: false })
    }

    // Import prisma here to avoid issues
    const { prisma } = await import('@/lib/prisma')

    // Get counts for status overview
    const [totalTransferred, totalSynced, needsSync] = await Promise.all([
      prisma.customerOrders.count({
        where: { IsTransferredToShopify: true, ShopifyOrderID: { not: null } },
      }),
      prisma.customerOrders.count({
        where: { ShopifyStatusSyncedAt: { not: null } },
      }),
      prisma.customerOrders.count({
        where: {
          IsTransferredToShopify: true,
          ShopifyOrderID: { not: null },
          OR: [
            { ShopifyStatusSyncedAt: null },
            {
              ShopifyStatusSyncedAt: {
                lt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
              },
            },
          ],
        },
      }),
    ])

    return NextResponse.json({
      configured: true,
      totalTransferred,
      totalSynced,
      needsSync,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
