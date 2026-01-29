/**
 * GET /api/admin/shopify/schema/mappings
 *
 * Returns all field mappings from ShopifyFieldMapping table.
 * Used by the summary table view.
 *
 * Query params:
 * - connectionId: Tenant identifier (default: "default")
 * - entityType: Filter by entity type (optional)
 * - enabled: Filter by enabled status ("true" | "false", optional)
 * - service: Filter by service name (e.g., "bulk_sync", optional)
 *
 * Returns:
 * - 200: { success: true, mappings: [...], total: number }
 * - 401: Unauthorized
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
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
    const entityType = searchParams.get('entityType')
    const enabledParam = searchParams.get('enabled')

    // 3. Validate connectionId
    if (connectionId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(connectionId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CONNECTION_ID', message: 'Invalid connectionId format' } },
        { status: 400 }
      )
    }

    // 4. Build where clause
    const where: {
      connectionId: string
      entityType?: string
      enabled?: boolean
      serviceName?: string
    } = { connectionId }

    if (entityType) {
      where.entityType = entityType
    }

    if (enabledParam === 'true') {
      where.enabled = true
    } else if (enabledParam === 'false') {
      where.enabled = false
    }

    // Filter by service name
    const serviceParam = searchParams.get('service')
    if (serviceParam) {
      where.serviceName = serviceParam
    }

    // 5. Fetch mappings
    const mappings = await prisma.shopifyFieldMapping.findMany({
      where,
      orderBy: [
        { entityType: 'asc' },
        { depth: 'asc' },
        { fieldPath: 'asc' },
      ],
    })

    // 6. Parse transformConfig JSON for each mapping
    const mappingsWithParsedConfig = mappings.map((m) => ({
      ...m,
      transformConfig: m.transformConfig ? JSON.parse(m.transformConfig) : null,
    }))

    return NextResponse.json({
      success: true,
      mappings: mappingsWithParsedConfig,
      total: mappings.length,
    })
  } catch (error) {
    console.error('[GetMappings] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    )
  }
}
