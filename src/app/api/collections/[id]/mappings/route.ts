import { prisma } from '@/lib/prisma'

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const collectionId = parseInt(id)
    if (Number.isNaN(collectionId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Get all Shopify values mapped to this collection
    const mappings = await prisma.shopifyValueMapping.findMany({
      where: { collectionId },
      orderBy: { skuCount: 'desc' },
      select: { rawValue: true },
    })

    return Response.json({
      mappings: mappings.map(m => m.rawValue),
    })
  } catch {
    return Response.json({ error: 'Failed to fetch mappings' }, { status: 500 })
  }
}
