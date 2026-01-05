'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

export async function createMainCategory(
  name: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const created = await prisma.skuMainCategory.create({
      data: {
        Name: name.trim(),
        DisplayOrder: 999,
      },
      select: { ID: true },
    })

    revalidatePath('/admin/categories')
    return { success: true, id: String(created.ID) }
  } catch {
    return { success: false, error: 'Failed to create main category' }
  }
}

export async function updateMainCategory(
  id: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.skuMainCategory.update({
      where: { ID: parseInt(id) },
      data: { Name: name.trim() },
    })

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update main category' }
  }
}

export async function deleteMainCategory(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const mainId = parseInt(id)

    await prisma.$transaction([
      prisma.skuMainSubRship.deleteMany({ where: { SkuMainCatID: mainId } }),
      prisma.skuMainCategory.delete({ where: { ID: mainId } }),
    ])

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to delete main category' }
  }
}

export async function createSubCategory(
  mainCategoryId: string,
  name: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const mainId = parseInt(mainCategoryId)

    const main = await prisma.skuMainCategory.findUnique({
      where: { ID: mainId },
      select: { Name: true },
    })

    const isPreOrderMain = (main?.Name ?? '').toLowerCase().includes('pre-order')

    const created = await prisma.skuCategories.create({
      data: {
        Name: name.trim(),
        IsPreOrder: isPreOrderMain,
        SortOrder: 999,
      },
      select: { ID: true },
    })

    await prisma.skuMainSubRship.create({
      data: {
        SkuMainCatID: mainId,
        SkuSubCatID: created.ID,
      },
    })

    revalidatePath('/admin/categories')
    return { success: true, id: String(created.ID) }
  } catch {
    return { success: false, error: 'Failed to create subcategory' }
  }
}

export async function updateSubCategory(
  id: string,
  data: {
    name?: string
    sortOrder?: number
    isPreOrder?: boolean
    useShopifyImages?: boolean
    shopifyOrderTags?: string
    onRouteStartDate?: string | null
    onRouteEndDate?: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const categoryId = parseInt(id)

    await prisma.skuCategories.update({
      where: { ID: categoryId },
      data: {
        ...(typeof data.name === 'string' ? { Name: data.name.trim() } : {}),
        ...(typeof data.sortOrder === 'number' ? { SortOrder: data.sortOrder } : {}),
        ...(typeof data.isPreOrder === 'boolean' ? { IsPreOrder: data.isPreOrder } : {}),
        ...(typeof data.useShopifyImages === 'boolean' ? { ShopifyImages: data.useShopifyImages } : {}),
        ...(typeof data.shopifyOrderTags === 'string' ? { ShopifyOrderTags: data.shopifyOrderTags.trim() } : {}),
        ...(data.onRouteStartDate !== undefined
          ? { OnRouteAvailableDate: data.onRouteStartDate ? new Date(data.onRouteStartDate) : null }
          : {}),
        ...(data.onRouteEndDate !== undefined
          ? { OnRouteAvailableDateEnd: data.onRouteEndDate ? new Date(data.onRouteEndDate) : null }
          : {}),
      },
    })

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update subcategory' }
  }
}

/**
 * Mirrors .NET's RemoveSkuSubCategory: remove relationship only.
 */
export async function removeSubCategoryFromMain(
  mainCategoryId: string,
  subCategoryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.skuMainSubRship.deleteMany({
      where: {
        SkuMainCatID: parseInt(mainCategoryId),
        SkuSubCatID: parseInt(subCategoryId),
      },
    })

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to remove subcategory from main category' }
  }
}

/**
 * Full delete is risky because Sku.CategoryID has FK NoAction.
 * Safer default: block deletion if any Sku exists.
 */
export async function deleteSubCategory(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const categoryId = parseInt(id)

    const count = await prisma.sku.count({ where: { CategoryID: categoryId } })
    if (count > 0) {
      return { success: false, error: 'Cannot delete: category still has products (SKUs) assigned.' }
    }

    await prisma.$transaction([
      prisma.skuMainSubRship.deleteMany({ where: { SkuSubCatID: categoryId } }),
      prisma.skuCategories.delete({ where: { ID: categoryId } }),
    ])

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to delete subcategory' }
  }
}

export async function reorderCategories(
  categoryType: 'main' | 'sub',
  orderedIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(
      orderedIds.map((id, idx) => {
        const order = idx + 1
        if (categoryType === 'main') {
          return prisma.skuMainCategory.update({
            where: { ID: parseInt(id) },
            data: { DisplayOrder: order },
          })
        }
        return prisma.skuCategories.update({
          where: { ID: parseInt(id) },
          data: { SortOrder: order },
        })
      })
    )

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to reorder categories' }
  }
}

export async function reorderProductsInCategory(
  categoryId: string,
  orderedProductIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const categoryInt = parseInt(categoryId)
    if (Number.isNaN(categoryInt)) return { success: false, error: 'Invalid category id' }

    // Mirror .NET UpdateSkuCategoryOrder: updates all Sku rows where SkuID contains baseSku.
    // Use a stable "spacing" like 10 to allow manual inserts later if needed.
    await prisma.$transaction(
      orderedProductIds.map((baseSku, idx) => {
        const displayPriority = (idx + 1) * 10
        return prisma.sku.updateMany({
          where: {
            CategoryID: categoryInt,
            SkuID: { contains: baseSku },
          },
          data: {
            DisplayPriority: displayPriority,
            DateModified: new Date(),
          },
        })
      })
    )

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to reorder products in category' }
  }
}

/**
 * Update DisplayPriority for all SKUs matching baseSku pattern within a category.
 * Matches .NET UpdateSkuCategoryOrder behavior from ProductOrderWithinCategory.aspx.
 *
 * @param categoryId - Category ID to scope the update
 * @param baseSku - SKU ID pattern (e.g., "LA-BL" updates "LA-BL-XS", "LA-BL-SM", etc.)
 * @param priority - New display priority (lower = first; null/0/negative treated as 100000)
 */
export async function updateProductPriority(
  categoryId: string,
  baseSku: string,
  priority: number | null
): Promise<{ success: boolean; updated?: number; error?: string }> {
  try {
    const categoryInt = parseInt(categoryId)
    if (Number.isNaN(categoryInt)) return { success: false, error: 'Invalid category id' }

    // .NET treats null, 0, or negative as 100000 (end of list)
    const effectivePriority =
      priority === null || priority <= 0 ? 100000 : priority

    const result = await prisma.sku.updateMany({
      where: {
        CategoryID: categoryInt,
        SkuID: { contains: baseSku },
      },
      data: {
        DisplayPriority: effectivePriority,
        DateModified: new Date(),
      },
    })

    revalidatePath('/admin/categories')
    revalidatePath('/buyer/pre-order')
    revalidatePath('/buyer/ats')

    return { success: true, updated: result.count }
  } catch {
    return { success: false, error: 'Failed to update product priority' }
  }
}