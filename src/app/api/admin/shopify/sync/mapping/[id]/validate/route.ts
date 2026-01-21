/**
 * Mapping Validation API Route
 * POST /api/admin/shopify/sync/mapping/[id]/validate - Validate a mapping
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMappingService, getMappingValidator, getSchemaCache } from '@/lib/sync-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const mappingService = getMappingService();
    const mapping = await mappingService.getById(id);

    if (!mapping) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found' } },
        { status: 404 }
      );
    }

    // Load cached schemas
    const schemaCache = getSchemaCache();
    const databaseSchema = await schemaCache.loadDatabase();
    const shopifySchema = await schemaCache.loadShopify();

    // Validate
    const validator = getMappingValidator();
    const result = await validator.validate(mapping, databaseSchema, shopifySchema);

    console.log(
      `[Mapping] Validated: ${id} - ${result.valid ? 'VALID' : 'INVALID'} ` +
        `(${result.errors.length} errors, ${result.warnings.length} warnings)`
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Mapping] Error validating mapping:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to validate mapping' } },
      { status: 500 }
    );
  }
}
