/**
 * Redis Connection Test API Route
 * POST /api/admin/shopify/sync/config/redis/test - Test Redis connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { testRedisConnection, maskRedisUrl } from '@/lib/sync-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = (body as { url?: string }).url;

    console.log(`[Config] Testing Redis connection: ${url ? maskRedisUrl(url) : 'default'}`);

    const result = await testRedisConnection(url);

    if (result.success) {
      return NextResponse.json({
        success: true,
        latencyMs: result.latencyMs,
        message: `Connected (${result.latencyMs}ms)`,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        message: result.error ?? 'Connection failed',
      });
    }
  } catch (error) {
    console.error('[Config] Error testing Redis:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to test Redis connection' } },
      { status: 500 }
    );
  }
}
