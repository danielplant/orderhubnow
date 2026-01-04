'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

/**
 * Create a new PPSize mapping.
 */
export async function createPPSize(input: {
  size: number
  correspondingPP: string
}): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!input.correspondingPP.trim()) {
      return { success: false, error: 'Corresponding PP is required' }
    }

    const created = await prisma.pPSizes.create({
      data: {
        Size: input.size,
        CorrespondingPP: input.correspondingPP.trim(),
      },
      select: { ID: true },
    })

    revalidatePath('/admin/prepacks')
    return { success: true, id: created.ID }
  } catch {
    return { success: false, error: 'Failed to create prepack size mapping' }
  }
}

/**
 * Update an existing PPSize mapping.
 */
export async function updatePPSize(
  id: string,
  input: {
    size?: number
    correspondingPP?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const ppId = parseInt(id)
    if (Number.isNaN(ppId)) {
      return { success: false, error: 'Invalid PPSizes id' }
    }

    await prisma.pPSizes.update({
      where: { ID: ppId },
      data: {
        ...(typeof input.size === 'number' ? { Size: input.size } : {}),
        ...(typeof input.correspondingPP === 'string'
          ? { CorrespondingPP: input.correspondingPP.trim() }
          : {}),
      },
    })

    revalidatePath('/admin/prepacks')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update prepack size mapping' }
  }
}

/**
 * Delete a PPSize mapping.
 */
export async function deletePPSize(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const ppId = parseInt(id)
    if (Number.isNaN(ppId)) {
      return { success: false, error: 'Invalid PPSizes id' }
    }

    await prisma.pPSizes.delete({
      where: { ID: ppId },
    })

    revalidatePath('/admin/prepacks')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to delete prepack size mapping' }
  }
}
