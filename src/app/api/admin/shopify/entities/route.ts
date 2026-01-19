/**
 * GET /api/admin/shopify/entities
 *
 * Returns list of known Shopify entity types that can be introspected.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getKnownEntities } from '@/lib/shopify/introspect'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const entities = getKnownEntities()

    return NextResponse.json({
      success: true,
      entities,
    })
  } catch (error) {
    console.error('Error fetching entities:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
