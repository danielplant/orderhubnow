/**
 * Redis Config API Route
 * GET /api/admin/shopify/sync/config/redis - Get Redis config status
 *
 * Note: Redis connection is configured via REDIS_URL environment variable.
 */

import { NextResponse } from 'next/server';
import { getConfigService, maskRedisUrl, isRedisConfigured } from '@/lib/sync-service';

export async function GET() {
  const configService = getConfigService();
  const config = await configService.load();

  if (!config.redis) {
    return NextResponse.json({
      configured: false,
      message: 'REDIS_URL environment variable not set. Scheduling features are unavailable.',
    });
  }

  return NextResponse.json({
    configured: true,
    url: maskRedisUrl(config.redis.url),
    connected: await isRedisConfigured(),
    managedBy: 'REDIS_URL environment variable',
  });
}
