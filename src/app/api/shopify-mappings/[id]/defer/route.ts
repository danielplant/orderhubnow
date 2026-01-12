import { prisma } from '@/lib/prisma'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const mappingId = parseInt(id)
    if (Number.isNaN(mappingId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const note = body?.note && typeof body.note === 'string'
      ? body.note.trim()
      : 'Deferred for later review'

    // Update mapping to deferred
    const mapping = await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        status: 'deferred',
        note,
        collectionId: null,
      },
    })

    return Response.json({
      success: true,
      mapping: {
        id: mapping.id,
        rawValue: mapping.rawValue,
        status: mapping.status,
        note: mapping.note,
        skuCount: mapping.skuCount,
      },
    })
  } catch {
    return Response.json({ error: 'Failed to defer value' }, { status: 500 })
  }
}
