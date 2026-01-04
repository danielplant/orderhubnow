'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

/**
 * Update inventory quantity for a SKU.
 * Updates all rows matching the SkuID (may be multiple size variants).
 */
export async function updateInventoryQuantity(input: {
  skuId: string
  newQuantity: number
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (input.newQuantity < 0) {
      return { success: false, error: 'Quantity cannot be negative' }
    }

    await prisma.sku.updateMany({
      where: { SkuID: input.skuId },
      data: {
        Quantity: input.newQuantity,
        DateModified: new Date(),
      },
    })

    revalidatePath('/admin/inventory')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update quantity' }
  }
}

/**
 * Update on-route quantity for a SKU.
 */
export async function updateInventoryOnRoute(input: {
  skuId: string
  onRoute: number
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (input.onRoute < 0) {
      return { success: false, error: 'On-route cannot be negative' }
    }

    await prisma.sku.updateMany({
      where: { SkuID: input.skuId },
      data: {
        OnRoute: input.onRoute,
        DateModified: new Date(),
      },
    })

    revalidatePath('/admin/inventory')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update on-route' }
  }
}
