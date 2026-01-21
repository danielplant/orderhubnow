/**
 * Webhooks API Routes
 * GET /api/admin/shopify/sync/webhooks - List webhook subscriptions
 *
 * Note: Webhook registration is managed via Shopify admin.
 * This endpoint shows processing stats for received webhooks.
 */

import { NextResponse } from 'next/server';
import { getWebhookStatsService, getConfigService } from '@/lib/sync-service';

export async function GET() {
  try {
    const configService = getConfigService();
    const config = await configService.load();

    if (!config.shopify?.accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_CONFIGURED', message: 'Shopify not configured' },
        },
        { status: 400 }
      );
    }

    const statsService = getWebhookStatsService();
    const stats = await statsService.getStats();

    return NextResponse.json({
      success: true,
      configured: {
        shopify: true,
        webhookSecret: !!process.env.SHOPIFY_WEBHOOK_SECRET,
      },
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/shopify-sync`,
      processingStats: stats,
      note: 'Webhook subscriptions are managed via Shopify admin. Configure webhooks to point to the callbackUrl above.',
    });
  } catch (error) {
    console.error('[Webhooks] Error getting webhook info:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get webhook info',
        },
      },
      { status: 500 }
    );
  }
}
