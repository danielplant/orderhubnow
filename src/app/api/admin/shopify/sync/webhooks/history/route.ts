/**
 * Webhook History API Route
 * GET /api/admin/shopify/sync/webhooks/history - Get webhook processing history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWebhookStatsService } from '@/lib/sync-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const statsService = getWebhookStatsService();
    const history = await statsService.getHistory(limit);

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error('[Webhooks] Error getting history:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get webhook history' },
      },
      { status: 500 }
    );
  }
}
