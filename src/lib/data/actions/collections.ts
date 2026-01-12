'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type {
  CollectionType,
  CollectionFormData,
  MappingStatus,
} from '@/lib/types/collection'

// ============================================================================
// Collection Actions
// ============================================================================

/**
 * Create a new collection
 */
export async function createCollection(data: CollectionFormData) {
  try {
    // Get max sort order for this type
    const maxSort = await prisma.collection.aggregate({
      where: { type: data.type },
      _max: { sortOrder: true },
    })
    const sortOrder = (maxSort._max.sortOrder ?? 0) + 1

    const collection = await prisma.collection.create({
      data: {
        name: data.name,
        type: data.type,
        sortOrder,
        shipWindowStart: data.shipWindowStart ? new Date(data.shipWindowStart) : null,
        shipWindowEnd: data.shipWindowEnd ? new Date(data.shipWindowEnd) : null,
        isActive: true,
      },
    })

    revalidatePath('/admin/collections')
    return { success: true, collection }
  } catch (error) {
    console.error('Failed to create collection:', error)
    return { success: false, error: 'Failed to create collection' }
  }
}

/**
 * Update an existing collection
 */
export async function updateCollection(
  id: number,
  data: Partial<CollectionFormData> & { isActive?: boolean }
) {
  try {
    const updateData: Record<string, unknown> = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.type !== undefined) updateData.type = data.type
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.shipWindowStart !== undefined) {
      updateData.shipWindowStart = data.shipWindowStart
        ? new Date(data.shipWindowStart)
        : null
    }
    if (data.shipWindowEnd !== undefined) {
      updateData.shipWindowEnd = data.shipWindowEnd
        ? new Date(data.shipWindowEnd)
        : null
    }

    const collection = await prisma.collection.update({
      where: { id },
      data: updateData,
    })

    revalidatePath('/admin/collections')
    return { success: true, collection }
  } catch (error) {
    console.error('Failed to update collection:', error)
    return { success: false, error: 'Failed to update collection' }
  }
}

/**
 * Delete a collection (only if no SKUs are assigned)
 */
export async function deleteCollection(id: number) {
  try {
    // Check if any SKUs are assigned
    const skuCount = await prisma.sku.count({
      where: { CollectionID: id },
    })

    if (skuCount > 0) {
      return {
        success: false,
        error: `Cannot delete: ${skuCount} SKUs are assigned to this collection`,
      }
    }

    // Check if any mappings point to this collection
    const mappingCount = await prisma.shopifyValueMapping.count({
      where: { collectionId: id },
    })

    if (mappingCount > 0) {
      return {
        success: false,
        error: `Cannot delete: ${mappingCount} Shopify mappings point to this collection`,
      }
    }

    await prisma.collection.delete({
      where: { id },
    })

    revalidatePath('/admin/collections')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete collection:', error)
    return { success: false, error: 'Failed to delete collection' }
  }
}

/**
 * Reorder collections within a type
 */
export async function reorderCollections(
  type: CollectionType,
  orderedIds: number[]
) {
  try {
    // Update sort order for each collection
    const updates = orderedIds.map((id, index) =>
      prisma.collection.update({
        where: { id },
        data: { sortOrder: index },
      })
    )

    await prisma.$transaction(updates)

    revalidatePath('/admin/collections')
    revalidatePath('/buyer/ats')
    revalidatePath('/buyer/pre-order')
    return { success: true }
  } catch (error) {
    console.error('Failed to reorder collections:', error)
    return { success: false, error: 'Failed to reorder collections' }
  }
}

/**
 * Update collection image URL
 */
export async function updateCollectionImage(id: number, imageUrl: string | null) {
  try {
    await prisma.collection.update({
      where: { id },
      data: { imageUrl },
    })

    revalidatePath('/admin/collections')
    return { success: true }
  } catch (error) {
    console.error('Failed to update collection image:', error)
    return { success: false, error: 'Failed to update collection image' }
  }
}

// ============================================================================
// Shopify Value Mapping Actions
// ============================================================================

/**
 * Map a Shopify value to a collection
 */
export async function mapValueToCollection(mappingId: number, collectionId: number) {
  try {
    await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        collectionId,
        status: 'mapped',
        note: null, // Clear any deferred note
      },
    })

    revalidatePath('/admin/collections/mapping')
    return { success: true }
  } catch (error) {
    console.error('Failed to map value:', error)
    return { success: false, error: 'Failed to map value to collection' }
  }
}

/**
 * Remove mapping from a Shopify value
 */
export async function unmapValue(mappingId: number) {
  try {
    await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        collectionId: null,
        status: 'unmapped',
      },
    })

    revalidatePath('/admin/collections/mapping')
    return { success: true }
  } catch (error) {
    console.error('Failed to unmap value:', error)
    return { success: false, error: 'Failed to unmap value' }
  }
}

/**
 * Defer a Shopify value with a note
 */
export async function deferValue(mappingId: number, note: string) {
  try {
    await prisma.shopifyValueMapping.update({
      where: { id: mappingId },
      data: {
        status: 'deferred',
        note: note || 'Deferred for later review',
        collectionId: null,
      },
    })

    revalidatePath('/admin/collections/mapping')
    return { success: true }
  } catch (error) {
    console.error('Failed to defer value:', error)
    return { success: false, error: 'Failed to defer value' }
  }
}

/**
 * Bulk map multiple values to a collection
 */
export async function bulkMapValues(mappingIds: number[], collectionId: number) {
  try {
    await prisma.shopifyValueMapping.updateMany({
      where: { id: { in: mappingIds } },
      data: {
        collectionId,
        status: 'mapped',
        note: null,
      },
    })

    revalidatePath('/admin/collections/mapping')
    return { success: true, count: mappingIds.length }
  } catch (error) {
    console.error('Failed to bulk map values:', error)
    return { success: false, error: 'Failed to bulk map values' }
  }
}
