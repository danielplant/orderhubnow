/**
 * Schema Discovery API Routes
 * GET /api/admin/shopify/sync/discovery - Get cached schemas
 * POST /api/admin/shopify/sync/discovery - Refresh schemas
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getConfigService,
  getSchemaCache,
  getConnector,
  getShopifyConnector,
} from '@/lib/sync-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source'); // 'database', 'shopify', or null for both

    const schemaCache = getSchemaCache();

    const response: Record<string, unknown> = {};

    if (!source || source === 'database') {
      response.database = await schemaCache.loadDatabase();
    }

    if (!source || source === 'shopify') {
      response.shopify = await schemaCache.loadShopify();
    }

    return NextResponse.json({
      success: true,
      ...response,
    });
  } catch (error) {
    console.error('[Discovery] Error getting cached schemas:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get schemas' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const source = (body as { source?: string }).source; // 'database', 'shopify', or null for both

    const configService = getConfigService();
    const config = await configService.load();
    const schemaCache = getSchemaCache();

    const response: Record<string, unknown> = {};

    // Refresh database schema
    if (!source || source === 'database') {
      if (!config.database?.connectionString) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'NOT_CONFIGURED', message: 'Database not configured' },
          },
          { status: 400 }
        );
      }

      const connector = await getConnector(config.database.connectionString);
      const schema = await connector.introspectSchema();
      await schemaCache.saveDatabase(schema);
      response.database = schema;

      console.log(`[Discovery] Database schema refreshed: ${schema.tables.length} tables`);
    }

    // Refresh Shopify schema
    if (!source || source === 'shopify') {
      if (!config.shopify?.accessToken) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'NOT_CONFIGURED', message: 'Shopify not configured' },
          },
          { status: 400 }
        );
      }

      const connector = getShopifyConnector(config.shopify);
      const schema = await connector.introspectSchema();
      await schemaCache.saveShopify(schema);
      response.shopify = schema;

      console.log(`[Discovery] Shopify schema refreshed: ${schema.resources.length} resources`);
    }

    return NextResponse.json({
      success: true,
      ...response,
    });
  } catch (error) {
    console.error('[Discovery] Error refreshing schemas:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to refresh schemas',
        },
      },
      { status: 500 }
    );
  }
}
