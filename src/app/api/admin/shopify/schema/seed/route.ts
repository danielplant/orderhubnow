/**
 * POST /api/admin/shopify/schema/seed
 *
 * Seeds the ShopifyFieldMapping table with all fields from the current
 * BULK_OPERATION_QUERY. This creates a baseline configuration that matches
 * the existing sync behavior.
 *
 * Query params:
 * - connectionId: Tenant identifier (default: "default")
 * - dryRun: If "true", returns fields without creating mappings
 *
 * Returns:
 * - 200: { success: true, created, skipped, total, fields }
 * - 401: Unauthorized
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import {
  seedFieldMappingsFromBulkQuery,
  getFieldsToSeed,
} from '@/lib/shopify/seed-field-mappings'

export async function POST(request: NextRequest) {
  // 1. Auth check
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Admin access required' } },
      { status: 401 }
    )
  }

  try {
    // 2. Extract query params
    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get('connectionId') ?? 'default'
    const dryRun = searchParams.get('dryRun') === 'true'

    // 3. Validate connectionId
    if (connectionId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(connectionId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CONNECTION_ID', message: 'Invalid connectionId format' } },
        { status: 400 }
      )
    }

    // 4. Dry run - just return what would be seeded
    if (dryRun) {
      const fields = getFieldsToSeed()
      return NextResponse.json({
        success: true,
        dryRun: true,
        total: fields.length,
        fields,
      })
    }

    // 5. Execute seed
    const result = await seedFieldMappingsFromBulkQuery(connectionId)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[SeedFieldMappings] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    )
  }
}

// Also support GET for dry-run preview
export async function GET(request: NextRequest) {
  // 1. Auth check
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Admin access required' } },
      { status: 401 }
    )
  }

  // Return fields that would be seeded
  const fields = getFieldsToSeed()
  return NextResponse.json({
    success: true,
    total: fields.length,
    fields,
  })
}
