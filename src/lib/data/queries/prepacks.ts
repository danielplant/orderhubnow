import { prisma } from '@/lib/prisma'
import type { PPSize, PPSizesListResult } from '@/lib/types/prepack'

/**
 * Get all PPSizes (prepack size mappings).
 * This is a small table, so no pagination needed.
 */
export async function getPPSizes(): Promise<PPSizesListResult> {
  const rows = await prisma.pPSizes.findMany({
    orderBy: { Size: 'asc' },
  })

  const items: PPSize[] = rows.map((r) => ({
    id: r.ID,
    size: r.Size,
    correspondingPP: r.CorrespondingPP,
  }))

  return {
    items,
    total: items.length,
  }
}

/**
 * Get a single PPSize by ID.
 */
export async function getPPSizeById(id: number): Promise<PPSize | null> {
  const row = await prisma.pPSizes.findUnique({
    where: { ID: id },
  })

  if (!row) return null

  return {
    id: row.ID,
    size: row.Size,
    correspondingPP: row.CorrespondingPP,
  }
}
