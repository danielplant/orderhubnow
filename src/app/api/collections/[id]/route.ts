import { prisma } from '@/lib/prisma'

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const collectionId = parseInt(id)
    if (Number.isNaN(collectionId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: { _count: { select: { skus: true } } },
    })

    if (!collection) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    return Response.json({
      id: collection.id,
      name: collection.name,
      type: collection.type,
      sortOrder: collection.sortOrder,
      imageUrl: collection.imageUrl,
      shipWindowStart: collection.shipWindowStart?.toISOString() ?? null,
      shipWindowEnd: collection.shipWindowEnd?.toISOString() ?? null,
      isActive: collection.isActive,
      skuCount: collection._count.skus,
      createdAt: collection.createdAt.toISOString(),
      updatedAt: collection.updatedAt.toISOString(),
    })
  } catch {
    return Response.json({ error: 'Failed to fetch collection' }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const collectionId = parseInt(id)
    if (Number.isNaN(collectionId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)

    const updateData: Record<string, unknown> = {}

    if (typeof body?.name === 'string') {
      updateData.name = body.name.trim()
    }
    if (body?.type && ['preorder_no_po', 'preorder_po', 'ats'].includes(body.type)) {
      updateData.type = body.type
    }
    if (typeof body?.isActive === 'boolean') {
      updateData.isActive = body.isActive
    }
    if (body?.shipWindowStart !== undefined) {
      updateData.shipWindowStart = body.shipWindowStart
        ? new Date(body.shipWindowStart)
        : null
    }
    if (body?.shipWindowEnd !== undefined) {
      updateData.shipWindowEnd = body.shipWindowEnd
        ? new Date(body.shipWindowEnd)
        : null
    }

    const collection = await prisma.collection.update({
      where: { id: collectionId },
      data: updateData,
    })

    return Response.json({
      success: true,
      collection: {
        id: collection.id,
        name: collection.name,
        type: collection.type,
        sortOrder: collection.sortOrder,
        imageUrl: collection.imageUrl,
        shipWindowStart: collection.shipWindowStart?.toISOString() ?? null,
        shipWindowEnd: collection.shipWindowEnd?.toISOString() ?? null,
        isActive: collection.isActive,
      },
    })
  } catch {
    return Response.json({ error: 'Failed to update collection' }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const collectionId = parseInt(id)
    if (Number.isNaN(collectionId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Check if any SKUs are assigned - block deletion if so
    const skuCount = await prisma.sku.count({
      where: { CollectionID: collectionId },
    })
    if (skuCount > 0) {
      return Response.json(
        { error: `Cannot delete: ${skuCount} SKUs are assigned to this collection` },
        { status: 400 }
      )
    }

    // Orphan any mappings pointing to this collection - set them back to unmapped
    // so they appear in the unmapped list for re-mapping
    const orphanedMappings = await prisma.shopifyValueMapping.updateMany({
      where: { collectionId: collectionId },
      data: {
        collectionId: null,
        status: 'unmapped',
      },
    })

    await prisma.collection.delete({
      where: { id: collectionId },
    })

    return Response.json({
      success: true,
      orphanedMappings: orphanedMappings.count,
    })
  } catch {
    return Response.json({ error: 'Failed to delete collection' }, { status: 500 })
  }
}
