import { prisma } from '@/lib/prisma'
import { getCollectionsGrouped } from '@/lib/data/queries/collections'
import type { CollectionType } from '@/lib/types/collection'

export async function GET() {
  try {
    const collections = await getCollectionsGrouped()
    return Response.json(collections)
  } catch {
    return Response.json({ error: 'Failed to fetch collections' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    if (!body?.name || typeof body.name !== 'string') {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!body?.type || !['preorder_no_po', 'preorder_po', 'ats'].includes(body.type)) {
      return Response.json({ error: 'Type must be preorder_no_po, preorder_po, or ats' }, { status: 400 })
    }

    const type = body.type as CollectionType

    // Get max sort order for this type
    const maxSort = await prisma.collection.aggregate({
      where: { type },
      _max: { sortOrder: true },
    })
    const sortOrder = (maxSort._max.sortOrder ?? 0) + 1

    const collection = await prisma.collection.create({
      data: {
        name: body.name.trim(),
        type,
        sortOrder,
        shipWindowStart: body.shipWindowStart ? new Date(body.shipWindowStart) : null,
        shipWindowEnd: body.shipWindowEnd ? new Date(body.shipWindowEnd) : null,
        isActive: true,
      },
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
  } catch (error) {
    console.error('Failed to create collection:', error)
    return Response.json({ error: 'Failed to create collection' }, { status: 500 })
  }
}
