/**
 * Configuration API Route
 * GET /api/admin/shopify/sync/config - Get current config (masked)
 *
 * Note: Configuration is managed via environment variables and cannot be
 * modified at runtime through this API.
 */

import { NextResponse } from 'next/server';
import {
  getConfigService,
  maskConnectionString,
  maskRedisUrl,
  isRedisConfigured,
} from '@/lib/sync-service';

function maskToken(token: string): string {
  if (token.length <= 8) return '****';
  return token.substring(0, 4) + '****' + token.substring(token.length - 4);
}

export async function GET() {
  const configService = getConfigService();
  const config = await configService.load();

  return NextResponse.json({
    database: config.database
      ? {
          connectionString: maskConnectionString(config.database.connectionString),
          type: config.database.type,
          configured: true,
        }
      : { configured: false },
    shopify: config.shopify
      ? {
          storeDomain: config.shopify.storeDomain,
          accessToken: maskToken(config.shopify.accessToken),
          apiVersion: config.shopify.apiVersion,
          configured: true,
        }
      : { configured: false },
    redis: config.redis
      ? {
          url: maskRedisUrl(config.redis.url),
          configured: await isRedisConfigured(),
        }
      : { configured: false },
    // Note: Runtime modification not supported - config comes from env vars
    managedBy: 'environment_variables',
  });
}
