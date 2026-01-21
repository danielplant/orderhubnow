/**
 * Webhook Stats API Route
 * GET /api/admin/shopify/sync/webhooks/stats - Get webhook processing statistics
 */

import { NextResponse } from 'next/server';
import { getWebhookStatsService } from '@/lib/sync-service';

export async function GET() {
  try {
    const statsService = getWebhookStatsService();
    const stats = await statsService.getStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Webhooks] Error getting stats:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get webhook stats' } },
      { status: 500 }
    );
  }
}
