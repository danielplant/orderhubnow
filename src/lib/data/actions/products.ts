'use server'

/**
 * Products (SKU) server actions - mutations for admin products page
 * Mirrors .NET AllSkusCNUS.aspx behavior
 */

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { CreateSkuInput, UpdateSkuInput } from '@/lib/types'

// ============================================================================
// Create
// ============================================================================

export async function createSku(
  data: CreateSkuInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Check if SKU ID already exists
    const existing = await prisma.sku.findFirst({
      where: { SkuID: data.skuId },
      select: { ID: true },
    })

    if (existing) {
      return { success: false, error: 'A SKU with this ID already exists' }
    }

    const created = await prisma.sku.create({
      data: {
        SkuID: data.skuId,
        Description: data.description,
        OrderEntryDescription: data.description,
        SkuColor: data.color,
        Size: data.size,
        CategoryID: data.categoryId,
        PriceCAD: data.priceCad,
        PriceUSD: data.priceUsd,
        Quantity: data.quantity,
        OnRoute: data.onRoute ?? 0,
        ShowInPreOrder: data.showInPreOrder,
        DateAdded: new Date(),
        DateModified: new Date(),
      },
      select: { ID: true },
    })

    revalidatePath('/admin/products')
    return { success: true, id: String(created.ID) }
  } catch (error) {
    console.error('createSku error:', error)
    return { success: false, error: 'Failed to create SKU' }
  }
}

// ============================================================================
// Update
// ============================================================================

export async function updateSku(
  id: string,
  data: UpdateSkuInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.sku.update({
      where: { ID: BigInt(id) },
      data: {
        ...(typeof data.description === 'string'
          ? { Description: data.description, OrderEntryDescription: data.description }
          : {}),
        ...(typeof data.color === 'string' ? { SkuColor: data.color } : {}),
        ...(typeof data.categoryId === 'number' ? { CategoryID: data.categoryId } : {}),
        ...(typeof data.priceCad === 'string' ? { PriceCAD: data.priceCad } : {}),
        ...(typeof data.priceUsd === 'string' ? { PriceUSD: data.priceUsd } : {}),
        ...(typeof data.quantity === 'number' ? { Quantity: data.quantity } : {}),
        ...(typeof data.onRoute === 'number' ? { OnRoute: data.onRoute } : {}),
        ...(typeof data.showInPreOrder === 'boolean'
          ? { ShowInPreOrder: data.showInPreOrder }
          : {}),
        DateModified: new Date(),
      },
    })

    revalidatePath('/admin/products')
    return { success: true }
  } catch (error) {
    console.error('updateSku error:', error)
    return { success: false, error: 'Failed to update SKU' }
  }
}

// ============================================================================
// Toggle Pre-Order Flag
// ============================================================================

/**
 * Toggle ShowInPreOrder flag for a SKU.
 * Maps to .NET MarkSkuAsShowInPreOrder.
 */
export async function setSkuPreOrderFlag(
  id: string,
  showInPreOrder: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.sku.update({
      where: { ID: BigInt(id) },
      data: {
        ShowInPreOrder: showInPreOrder,
        DateModified: new Date(),
      },
    })

    revalidatePath('/admin/products')
    return { success: true }
  } catch (error) {
    console.error('setSkuPreOrderFlag error:', error)
    return { success: false, error: 'Failed to update pre-order flag' }
  }
}

// ============================================================================
// Delete
// ============================================================================

export async function deleteSku(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.sku.delete({
      where: { ID: BigInt(id) },
    })

    revalidatePath('/admin/products')
    return { success: true }
  } catch (error) {
    console.error('deleteSku error:', error)
    return { success: false, error: 'Failed to delete SKU' }
  }
}

export async function bulkDeleteSkus(
  ids: string[]
): Promise<{ success: boolean; deleted: number; errors?: string[] }> {
  try {
    if (ids.length === 0) {
      return { success: true, deleted: 0 }
    }

    const result = await prisma.sku.deleteMany({
      where: {
        ID: { in: ids.map((id) => BigInt(id)) },
      },
    })

    revalidatePath('/admin/products')
    return { success: true, deleted: result.count }
  } catch (error) {
    console.error('bulkDeleteSkus error:', error)
    return { success: false, deleted: 0, errors: ['Failed to delete SKUs'] }
  }
}

// ============================================================================
// Bulk Update Pre-Order Flag
// ============================================================================

export async function bulkSetPreOrderFlag(
  ids: string[],
  showInPreOrder: boolean
): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    if (ids.length === 0) {
      return { success: true, updated: 0 }
    }

    const result = await prisma.sku.updateMany({
      where: {
        ID: { in: ids.map((id) => BigInt(id)) },
      },
      data: {
        ShowInPreOrder: showInPreOrder,
        DateModified: new Date(),
      },
    })

    revalidatePath('/admin/products')
    return { success: true, updated: result.count }
  } catch (error) {
    console.error('bulkSetPreOrderFlag error:', error)
    return { success: false, updated: 0, error: 'Failed to update pre-order flags' }
  }
}
