/**
 * Mapping Preview API Route
 * POST /api/admin/shopify/sync/mapping/[id]/preview - Preview a mapping with live data
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getMappingService,
  getMappingPreview,
  getConfigService,
  getShopifyConnector,
} from '@/lib/sync-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5', 10);

    const mappingService = getMappingService();
    const mapping = await mappingService.getById(id);

    if (!mapping) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found' } },
        { status: 404 }
      );
    }

    // Get Shopify config
    const configService = getConfigService();
    const config = await configService.load();
    if (!config.shopify?.accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_CONFIGURED',
            message: 'Shopify not configured. Cannot generate preview.',
          },
        },
        { status: 400 }
      );
    }

    // Generate preview
    const connector = getShopifyConnector(config.shopify);
    const preview = getMappingPreview();
    const result = await preview.preview(mapping, connector, limit);

    console.log(`[Mapping] Preview: ${id} - ${result.sampleRows.length} rows fetched`);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Mapping] Error generating preview:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate preview' } },
      { status: 500 }
    );
  }
}
