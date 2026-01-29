/**
 * PUT /api/admin/shopify/schema/field
 *
 * Upserts a field mapping configuration.
 * Creates a new mapping if it doesn't exist, updates if it does.
 *
 * Request body:
 * - connectionId?: string (defaults to "default")
 * - fullPath: string (e.g., "ProductVariant.price.amount")
 * - enabled: boolean
 * - targetTable?: string | null
 * - targetColumn?: string | null
 * - transformType: "direct" | "parseFloat" | "parseInt" | "lookup" | "custom"
 * - transformConfig?: object | null
 *
 * Returns:
 * - 200: { success: true, mapping: {...}, created: boolean }
 * - 400: Validation error / protected field error
 * - 401: Unauthorized
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

// ============================================================================
// Validation Schema
// ============================================================================

const FieldMappingUpdateSchema = z.object({
  connectionId: z
    .string()
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid connectionId format')
    .default('default'),

  fullPath: z
    .string()
    .min(3, 'fullPath is required')
    .max(255)
    .regex(
      /^[A-Z][a-zA-Z]+(\.[a-zA-Z][a-zA-Z0-9_]*)+$/,
      'fullPath must be EntityType.field.path format'
    ),

  enabled: z.boolean(),

  targetTable: z
    .string()
    .max(100)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Invalid table name')
    .optional()
    .nullable()
    .default(null),

  targetColumn: z
    .string()
    .max(100)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Invalid column name')
    .optional()
    .nullable()
    .default(null),

  transformType: z.enum(['direct', 'parseFloat', 'parseInt', 'lookup', 'custom']),

  transformConfig: z.unknown().optional().nullable().default(null),
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse fullPath into entityType, fieldPath, and depth
 * e.g., "ProductVariant.price.amount" → { entityType: "ProductVariant", fieldPath: "price.amount", depth: 2 }
 */
function parseFullPath(fullPath: string): { entityType: string; fieldPath: string; depth: number } {
  const parts = fullPath.split('.')
  if (parts.length < 2) {
    throw new Error('fullPath must have at least EntityType.field')
  }
  const entityType = parts[0]
  const fieldPath = parts.slice(1).join('.')
  const depth = parts.length - 1

  return { entityType, fieldPath, depth }
}

// ============================================================================
// Route Handler
// ============================================================================

export async function PUT(request: NextRequest) {
  // 1. Auth check
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Admin access required' } },
      { status: 401 }
    )
  }

  try {
    // 2. Parse and validate request body
    const body = await request.json()
    const parsed = FieldMappingUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      )
    }

    const { connectionId, fullPath, enabled, targetTable, targetColumn, transformType, transformConfig: rawTransformConfig } =
      parsed.data
    
    // Serialize transformConfig for database storage
    const transformConfig = rawTransformConfig ? JSON.stringify(rawTransformConfig) : null

    // 3. Parse fullPath
    let pathInfo: { entityType: string; fieldPath: string; depth: number }
    try {
      pathInfo = parseFullPath(fullPath)
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_PATH', message: 'Invalid fullPath format' },
        },
        { status: 400 }
      )
    }

    const { entityType, fieldPath, depth } = pathInfo

    // 4. Check for existing mapping (to determine if protected)
    const existing = await prisma.shopifyFieldMapping.findUnique({
      where: {
        connectionId_entityType_fieldPath: {
          connectionId,
          entityType,
          fieldPath,
        },
      },
    })

    // 5. Validate protected field cannot be disabled
    if (existing?.isProtected && !enabled) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PROTECTED_FIELD',
            message: `Cannot disable protected field: ${fullPath}`,
          },
        },
        { status: 400 }
      )
    }

    // 6. Upsert the mapping
    const mapping = await prisma.shopifyFieldMapping.upsert({
      where: {
        connectionId_entityType_fieldPath: {
          connectionId,
          entityType,
          fieldPath,
        },
      },
      create: {
        connectionId,
        entityType,
        fieldPath,
        fullPath,
        depth,
        targetTable,
        targetColumn,
        transformType,
        transformConfig,
        enabled,
        isProtected: false, // New mappings are not protected by default
        accessStatus: 'untested',
      },
      update: {
        targetTable,
        targetColumn,
        transformType,
        transformConfig,
        enabled,
        // Don't update: isProtected, accessStatus (managed separately)
      },
    })

    // 7. Log the operation
    console.log(
      `[FieldMapping] ${existing ? 'Updated' : 'Created'}: ${fullPath} (enabled=${enabled}, table=${targetTable || 'none'})`
    )

    // 8. Return success
    return NextResponse.json({
      success: true,
      mapping: {
        ...mapping,
        transformConfig: mapping.transformConfig ? JSON.parse(mapping.transformConfig) : null,
      },
      created: !existing,
    })
  } catch (error) {
    console.error('[FieldMapping] Error saving mapping:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: `Failed to save mapping: ${message}` },
      },
      { status: 500 }
    )
  }
}
