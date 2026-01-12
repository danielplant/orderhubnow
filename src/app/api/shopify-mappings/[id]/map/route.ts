import { prisma } from '@/lib/prisma'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const mappingId = parseInt(id)
    if (Number.isNaN(mappingId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)

    if (typeof body?.collectionId !== 'number') {
      return Response.json({ error: 'collectionId is required' }, { status: 400 })
    }

    // Verify collection exists
    const collection = await prisma.collection.findUnique({
      where: { id: body.collectionId },
    })
    if (!collection) {
      return Response.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Update mapping
    const mapping = await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        collectionId: body.collectionId,
        status: 'mapped',
        note: null, // Clear any deferred note
      },
      include: { collection: true },
    })

    return Response.json({
      success: true,
      mapping: {
        id: mapping.id,
        rawValue: mapping.rawValue,
        collectionId: mapping.collectionId,
        status: mapping.status,
        note: mapping.note,
        skuCount: mapping.skuCount,
        collection: mapping.collection
          ? {
              id: mapping.collection.id,
              name: mapping.collection.name,
              type: mapping.collection.type,
            }
          : null,
      },
    })
  } catch {
    return Response.json({ error: 'Failed to map value' }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const mappingId = parseInt(id)
    if (Number.isNaN(mappingId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Remove mapping (set to unmapped)
    await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        collectionId: null,
        status: 'unmapped',
      },
    })

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Failed to unmap value' }, { status: 500 })
  }
}
