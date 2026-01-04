import { getCategoryWithProducts } from '@/lib/data/queries/categories'

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const data = await getCategoryWithProducts(id)
    
    if (!data) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Failed to fetch category products' }, { status: 500 })
  }
}
