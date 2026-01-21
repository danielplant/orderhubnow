/**
 * Public Shopify Webhook Handler
 * POST /api/webhooks/shopify-sync - Receive webhooks from Shopify
 *
 * This endpoint is public (no auth required) but verifies HMAC signature
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getWebhookProcessor, isRedisConfigured, getWebhookQueue } from '@/lib/sync-service';

// Shopify sends HEAD requests to verify the endpoint
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get raw body for HMAC verification
    const rawBody = await request.text();

    // Verify HMAC signature
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Webhook] SHOPIFY_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    if (!hmacHeader) {
      console.error('[Webhook] Missing HMAC header');
      return NextResponse.json(
        { error: 'Missing HMAC signature' },
        { status: 401 }
      );
    }

    const expectedHmac = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    if (hmacHeader !== expectedHmac) {
      console.error('[Webhook] Invalid HMAC signature');
      return NextResponse.json(
        { error: 'Invalid HMAC signature' },
        { status: 401 }
      );
    }

    // Parse the payload
    const payload = JSON.parse(rawBody);

    // Extract webhook metadata from headers
    const topic = request.headers.get('x-shopify-topic') || 'unknown';
    const shopDomain = request.headers.get('x-shopify-shop-domain') || 'unknown';
    const webhookId = request.headers.get('x-shopify-webhook-id') || crypto.randomUUID();

    console.log(`[Webhook] Received ${topic} from ${shopDomain}`);

    // Check if Redis is available for queuing
    const redisAvailable = await isRedisConfigured();

    if (redisAvailable) {
      // Queue the webhook for background processing
      const webhookQueue = await getWebhookQueue();
      await webhookQueue.enqueue({
        id: webhookId,
        topic,
        shopDomain,
        payload,
        receivedAt: new Date().toISOString(),
      });

      console.log(`[Webhook] Queued ${topic} for processing (${Date.now() - startTime}ms)`);

      return NextResponse.json({
        success: true,
        queued: true,
        webhookId,
      });
    } else {
      // Process inline if no Redis
      const processor = getWebhookProcessor();
      const result = await processor.process({
        id: webhookId,
        topic,
        shopDomain,
        payload,
        receivedAt: new Date().toISOString(),
      });

      console.log(
        `[Webhook] Processed ${topic} inline: ${result.recordsWritten} records (${Date.now() - startTime}ms)`
      );

      return NextResponse.json({
        success: result.success,
        queued: false,
        webhookId,
        recordsWritten: result.recordsWritten,
        processingMs: result.processingMs,
      });
    }
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process webhook',
      },
      { status: 500 }
    );
  }
}
