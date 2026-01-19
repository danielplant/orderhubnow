/**
 * GET /api/admin/shopify/introspect/[type]
 *
 * Introspects a Shopify entity type and returns all fields with categorization.
 * Results are cached in ShopifySchemaCache table.
 *
 * Query params:
 * - refresh=true: Force refresh from Shopify API (ignore cache)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { introspectEntityType, getKnownEntities } from '@/lib/shopify/introspect'

interface RouteParams {
  params: Promise<{ type: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type } = await params

  // Validate entity type
  const knownEntities = getKnownEntities()
  const isKnown = knownEntities.some((e) => e.name === type)
  if (!isKnown) {
    return NextResponse.json(
      { error: `Unknown entity type: ${type}. Known types: ${knownEntities.map((e) => e.name).join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const refresh = searchParams.get('refresh') === 'true'

    const result = await introspectEntityType(type, { refresh })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error(`Error introspecting ${type}:`, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
