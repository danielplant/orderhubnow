/**
 * Mapping API Routes
 * GET /api/admin/shopify/sync/mapping - List all mappings
 * POST /api/admin/shopify/sync/mapping - Create a new mapping
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMappingService } from '@/lib/sync-service';

// Validation schemas
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

export async function GET() {
  try {
    const mappingService = getMappingService();
    const mappings = await mappingService.getAll();
    return NextResponse.json({ mappings });
  } catch (error) {
    console.error('[Mapping] Error listing mappings:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list mappings' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = MappingConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const mappingService = getMappingService();
    const id = await mappingService.create(parsed.data);

    console.log(`[Mapping] Created: ${id} (${parsed.data.name})`);

    return NextResponse.json(
      { success: true, id, message: 'Mapping created' },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Mapping] Error creating mapping:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create mapping' } },
      { status: 500 }
    );
  }
}
