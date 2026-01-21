/**
 * Single Mapping API Routes
 * GET /api/admin/shopify/sync/mapping/[id] - Get mapping by ID
 * PUT /api/admin/shopify/sync/mapping/[id] - Update mapping
 * DELETE /api/admin/shopify/sync/mapping/[id] - Delete mapping
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMappingService } from '@/lib/sync-service';

// Same validation schema as parent route
const FieldSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('single'),
    resource: z.string(),
    field: z.string(),
  }),
  z.object({
    type: z.literal('multi'),
    fields: z.array(
      z.object({
        resource: z.string(),
        field: z.string(),
        alias: z.string(),
      })
    ),
  }),
]);

const TransformSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('direct') }),
  z.object({ type: z.literal('coerce'), targetType: z.string() }),
  z.object({ type: z.literal('expression'), formula: z.string() }),
  z.object({
    type: z.literal('lookup'),
    table: z.string(),
    matchColumn: z.string(),
    returnColumn: z.string(),
    defaultValue: z.unknown().optional(),
  }),
  z.object({ type: z.literal('template'), template: z.string() }),
  z.object({
    type: z.literal('default'),
    value: z.unknown().transform((v) => v ?? null),
    onlyIfNull: z.boolean(),
  }),
]);

const FieldMappingSchema = z.object({
  id: z.string(),
  source: FieldSourceSchema,
  target: z.object({
    table: z.string(),
    column: z.string(),
  }),
  transform: TransformSchema.optional(),
  enabled: z.boolean().default(true),
});

const MappingConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  sourceResource: z.string(),
  targetTable: z.string(),
  keyMapping: z
    .object({
      sourceField: z.string(),
      targetColumn: z.string(),
    })
    .optional(),
  mappings: z.array(FieldMappingSchema),
  webhookEnabled: z.boolean().optional(),
  deleteStrategy: z.enum(['hard', 'soft', 'ignore']).optional(),
  softDeleteColumn: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    return NextResponse.json({ mapping });
  } catch (error) {
    console.error('[Mapping] Error getting mapping:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get mapping' } },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = MappingConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const mappingService = getMappingService();
    const updated = await mappingService.update(id, parsed.data);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found' } },
        { status: 404 }
      );
    }

    console.log(`[Mapping] Updated: ${id} (${parsed.data.name})`);

    return NextResponse.json({ success: true, message: 'Mapping updated' });
  } catch (error) {
    console.error('[Mapping] Error updating mapping:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update mapping' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const mappingService = getMappingService();
    const deleted = await mappingService.delete(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found' } },
        { status: 404 }
      );
    }

    console.log(`[Mapping] Deleted: ${id}`);

    return NextResponse.json({ success: true, message: 'Mapping deleted' });
  } catch (error) {
    console.error('[Mapping] Error deleting mapping:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete mapping' } },
      { status: 500 }
    );
  }
}
