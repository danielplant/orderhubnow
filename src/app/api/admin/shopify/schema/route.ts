/**
 * GET /api/admin/shopify/schema
 *
 * Returns the complete schema graph data for React Flow rendering.
 * Combines cached introspection data with field mappings.
 *
 * Query params:
 * - connectionId: Tenant identifier (default: "default")
 *
 * Returns:
 * - 200: SchemaGraphData (nodes, edges, metadata)
 * - 400: Invalid connectionId format
 * - 401: Unauthorized (not admin)
 * - 404: Cache is empty (run introspection first)
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { buildSchemaGraph } from '@/lib/shopify/schema-graph'

export async function GET(request: NextRequest) {
  // 1. Auth check
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Extract and validate query params
  const searchParams = request.nextUrl.searchParams
  const connectionId = searchParams.get('connectionId') ?? 'default'

  // Validate connectionId format (prevent DoS via large inputs)
  if (connectionId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(connectionId)) {
    return NextResponse.json(
      { error: 'Invalid connectionId format', code: 'INVALID_CONNECTION_ID' },
      { status: 400 }
    )
  }

  try {
    // 3. Build the graph with timing
    const start = Date.now()
    const graphData = await buildSchemaGraph(connectionId)
    const durationMs = Date.now() - start

    // 4. Handle empty cache
    if (!graphData) {
      return NextResponse.json(
        {
          error: 'Schema cache is empty. Run introspection first to populate the cache.',
          code: 'CACHE_EMPTY',
          hint: 'Visit /admin/dev/shopify/config and click "Refresh Schema" for each entity type.',
        },
        { status: 404 }
      )
    }

    // 5. Log slow requests for monitoring
    if (durationMs > 1000) {
      console.warn(`Slow schema graph build: ${durationMs}ms for connectionId=${connectionId}`)
    }

    // 6. Return success response
    return NextResponse.json({
      success: true,
      ...graphData,
      _meta: { durationMs },
    })
  } catch (error) {
    // 7. Handle errors
    console.error('Error building schema graph:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to build schema graph',
        details: message,
      },
      { status: 500 }
    )
  }
}
