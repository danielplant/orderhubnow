import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params
    const id = parseInt(idParam, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const body = await request.json()
    const { enabled } = body

    // Only allow toggling 'enabled' in Phase 3
    // targetTable/targetColumn deferred to Phase 4
    if (enabled === undefined) {
      return NextResponse.json(
        { error: 'Only "enabled" field can be updated in this version' },
        { status: 400 }
      )
    }

    // Validate the record exists
    const existing = await prisma.shopifyFieldMapping.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    // Check if field is protected (can't disable protected fields)
    if (enabled === false && existing.isProtected) {
      return NextResponse.json(
        { error: 'Cannot disable protected field' },
        { status: 400 }
      )
    }

    // Only allow toggling metafields in Phase 3
    if (existing.fieldType !== 'metafield') {
      return NextResponse.json(
        { error: 'Only metafield fields can be toggled. Non-metafield fields are fixed in the current version.' },
        { status: 400 }
      )
    }

    const updated = await prisma.shopifyFieldMapping.update({
      where: { id },
      data: { enabled },
    })

    console.log(`[Mapping] Updated field ${id}: enabled=${enabled}`)

    return NextResponse.json({
      success: true,
      mapping: updated,
    })

  } catch (error) {
    console.error('[Mapping Update] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
