import { prisma } from '@/lib/prisma'

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const categoryId = parseInt(id)
    if (Number.isNaN(categoryId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    const category = await prisma.skuCategories.findUnique({
      where: { ID: categoryId },
      include: { _count: { select: { Sku: true } } },
    })

    if (!category) return Response.json({ error: 'Not found' }, { status: 404 })

    return Response.json({
      id: category.ID,
      name: category.Name,
      isPreOrder: category.IsPreOrder ?? false,
      useShopifyImages: category.ShopifyImages ?? false,
      sortOrder: category.SortOrder ?? 0,
      shopifyOrderTags: category.ShopifyOrderTags ?? null,
      onRouteStartDate: category.OnRouteAvailableDate
        ? category.OnRouteAvailableDate.toISOString()
        : null,
      onRouteEndDate: category.OnRouteAvailableDateEnd
        ? category.OnRouteAvailableDateEnd.toISOString()
        : null,
      productCount: category._count.Sku,
    })
  } catch {
    return Response.json({ error: 'Failed to fetch category' }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const categoryId = parseInt(id)
    if (Number.isNaN(categoryId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)

    await prisma.skuCategories.update({
      where: { ID: categoryId },
      data: {
        ...(typeof body?.name === 'string' ? { Name: body.name.trim() } : {}),
        ...(typeof body?.sortOrder === 'number' ? { SortOrder: body.sortOrder } : {}),
        ...(typeof body?.isPreOrder === 'boolean' ? { IsPreOrder: body.isPreOrder } : {}),
        ...(typeof body?.useShopifyImages === 'boolean'
          ? { ShopifyImages: body.useShopifyImages }
          : {}),
        ...(typeof body?.shopifyOrderTags === 'string'
          ? { ShopifyOrderTags: body.shopifyOrderTags.trim() }
          : {}),
        ...(body?.onRouteStartDate !== undefined
          ? {
              OnRouteAvailableDate: body.onRouteStartDate
                ? new Date(body.onRouteStartDate)
                : null,
            }
          : {}),
        ...(body?.onRouteEndDate !== undefined
          ? {
              OnRouteAvailableDateEnd: body.onRouteEndDate
                ? new Date(body.onRouteEndDate)
                : null,
            }
          : {}),
      },
    })

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const categoryId = parseInt(id)
    if (Number.isNaN(categoryId)) {
      return Response.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Check if any SKUs are assigned to this category
    const count = await prisma.sku.count({ where: { CategoryID: categoryId } })
    if (count > 0) {
      return Response.json(
        { error: 'Cannot delete: category still has products assigned' },
        { status: 400 }
      )
    }

    await prisma.$transaction([
      prisma.skuMainSubRship.deleteMany({ where: { SkuSubCatID: categoryId } }),
      prisma.skuCategories.delete({ where: { ID: categoryId } }),
    ])

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
