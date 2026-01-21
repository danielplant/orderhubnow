/**
 * Shopify Config API Route
 * GET /api/admin/shopify/sync/config/shopify - Get Shopify config status
 *
 * Note: Shopify connection is configured via environment variables.
 */

import { NextResponse } from 'next/server';
import { getConfigService } from '@/lib/sync-service';

function maskToken(token: string): string {
  if (token.length <= 8) return '****';
  return token.substring(0, 4) + '****' + token.substring(token.length - 4);
}

export async function GET() {
  const configService = getConfigService();
  const config = await configService.load();

  if (!config.shopify) {
    return NextResponse.json({
      configured: false,
      message: 'SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN environment variables not set',
    });
  }

  return NextResponse.json({
    configured: true,
    storeDomain: config.shopify.storeDomain,
    accessToken: maskToken(config.shopify.accessToken),
    apiVersion: config.shopify.apiVersion,
    managedBy: 'SHOPIFY_* environment variables',
  });
}
