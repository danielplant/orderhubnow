/**
 * Register Webhook API Route
 * POST /api/admin/shopify/sync/webhooks/register
 *
 * Note: Webhook registration via API is not currently implemented.
 * Please register webhooks via Shopify admin panel.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          'Webhook registration via API is not currently implemented. ' +
          'Please register webhooks via Shopify admin panel and point them to: ' +
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/shopify-sync`,
      },
    },
    { status: 501 }
  );
}
