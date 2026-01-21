/**
 * Unregister Webhook API Route
 * POST /api/admin/shopify/sync/webhooks/unregister
 *
 * Note: Webhook management via API is not currently implemented.
 * Please manage webhooks via Shopify admin panel.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          'Webhook management via API is not currently implemented. ' +
          'Please manage webhooks via Shopify admin panel.',
      },
    },
    { status: 501 }
  );
}
