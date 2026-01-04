import { getCategoryTree } from '@/lib/data/queries/categories'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const tree = await getCategoryTree()
    return Response.json(tree)
  } catch {
    return Response.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const name = body?.name
    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Missing name' }, { status: 400 })
    }

    const created = await prisma.skuMainCategory.create({
      data: { Name: name.trim(), DisplayOrder: 999 },
      select: { ID: true },
    })

    return Response.json({ success: true, id: String(created.ID) })
  } catch {
    return Response.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
