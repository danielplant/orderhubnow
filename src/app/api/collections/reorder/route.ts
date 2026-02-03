import { prisma } from '@/lib/prisma'
import type { CollectionType } from '@/lib/types/collection'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    if (!body?.type || !['preorder_no_po', 'preorder_po', 'ats'].includes(body.type)) {
      return Response.json({ error: 'Type must be preorder_no_po, preorder_po, or ats' }, { status: 400 })
    }

    if (!Array.isArray(body?.orderedIds) || body.orderedIds.length === 0) {
      return Response.json({ error: 'orderedIds must be a non-empty array' }, { status: 400 })
    }

    const type = body.type as CollectionType
    const orderedIds = body.orderedIds as number[]

    // Verify all IDs belong to collections of the specified type
    const collections = await prisma.collection.findMany({
      where: { id: { in: orderedIds }, type },
      select: { id: true },
    })

    if (collections.length !== orderedIds.length) {
      return Response.json(
        { error: 'Some IDs do not belong to collections of the specified type' },
        { status: 400 }
      )
    }

    // Update sort order for each collection
    const updates = orderedIds.map((id, index) =>
      prisma.collection.update({
        where: { id },
        data: { sortOrder: index },
      })
    )

    await prisma.$transaction(updates)

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Failed to reorder collections' }, { status: 500 })
  }
}
