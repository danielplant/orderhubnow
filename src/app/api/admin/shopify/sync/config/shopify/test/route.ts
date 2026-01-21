/**
 * Shopify Connection Test API Route
 * POST /api/admin/shopify/sync/config/shopify/test - Test Shopify connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getShopifyConnector } from '@/lib/sync-service';

const ShopifyConfigSchema = z.object({
  storeDomain: z.string().min(1),
  accessToken: z.string().min(1),
  apiVersion: z.string().default('2024-01'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ShopifyConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { storeDomain, accessToken, apiVersion } = parsed.data;

    console.log(`[Config] Testing Shopify connection: ${storeDomain}`);

    try {
      const connector = getShopifyConnector({
        storeDomain,
        accessToken,
        apiVersion,
      });

      const result = await connector.testConnection();
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.error(`[Config] Shopify connection test failed: ${message}`);

      return NextResponse.json({
        success: false,
        message,
      });
    }
  } catch (error) {
    console.error('[Config] Error testing Shopify:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to test Shopify connection' } },
      { status: 500 }
    );
  }
}
