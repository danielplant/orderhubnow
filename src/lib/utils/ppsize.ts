/**
 * PPSize Utility - Prepack size handling for categories 399 and 401
 * 
 * .NET Reference: PreOrder.aspx.cs lines 502-566
 * 
 * For prepack categories (399, 401), the size code is extracted from position 2
 * of the SKU ID (not the hyphen-split method used elsewhere).
 * 
 * SKU format for prepacks: XX[SizeCode]-REST-OF-SKU
 * - Position 0-1: Prefix (2 chars)
 * - Position 2: Single-digit size code
 * - Position 3+: Rest of SKU
 * 
 * Category 401 has special remapping:
 * - Size code 3 → lookup code 33
 * - Size code 4 → lookup code 44
 */

import { prisma } from '@/lib/prisma'

// Categories that use position-based size parsing
const PREPACK_CATEGORIES = [399, 401]

/**
 * Check if a category uses prepack size parsing
 */
export function isPrepackCategory(categoryId: number): boolean {
  return PREPACK_CATEGORIES.includes(categoryId)
}

/**
 * Extract size code from SKU for prepack categories.
 * Uses position-based parsing (index 2) rather than hyphen split.
 * 
 * @param skuId - Full SKU ID string
 * @param categoryId - Category ID (used for 401 remapping)
 * @returns Numeric size code for PPSizes table lookup
 */
export function getSizeCodeForPrepack(skuId: string, categoryId: number): number | null {
  if (skuId.length < 3) return null
  
  const char = skuId.charAt(2)
  if (!/\d/.test(char)) return null
  
  const rawCode = parseInt(char, 10)
  
  // Category 401 special remapping per .NET lines 549-554
  if (categoryId === 401) {
    if (rawCode === 3) return 33
    if (rawCode === 4) return 44
  }
  
  return rawCode
}

// Cache for PPSizes lookup (loaded once)
let ppSizeCache: Map<number, string> | null = null

/**
 * Load PPSizes table into memory cache
 */
async function loadPPSizeCache(): Promise<Map<number, string>> {
  if (ppSizeCache) return ppSizeCache
  
  const rows = await prisma.pPSizes.findMany({
    select: { Size: true, CorrespondingPP: true },
  })
  
  ppSizeCache = new Map(rows.map(r => [r.Size, r.CorrespondingPP]))
  return ppSizeCache
}

/**
 * Get display size name for a SKU in a prepack category.
 * 
 * @param skuId - Full SKU ID string
 * @param categoryId - Category ID
 * @returns Display name from PPSizes table, or fallback to raw code
 */
export async function getPPSizeDisplay(skuId: string, categoryId: number): Promise<string> {
  const sizeCode = getSizeCodeForPrepack(skuId, categoryId)
  if (sizeCode === null) {
    // Fallback: use hyphen-split for malformed SKUs
    const lastHyphen = skuId.lastIndexOf('-')
    return lastHyphen > 0 ? skuId.substring(lastHyphen + 1) : 'O/S'
  }
  
  const cache = await loadPPSizeCache()
  const displayName = cache.get(sizeCode)
  
  if (displayName) return displayName
  
  // Fallback if size code not in PPSizes table
  return String(sizeCode)
}

/**
 * Batch lookup PPSize display names for multiple SKUs.
 * More efficient than individual lookups.
 * 
 * @param skuIds - Array of SKU IDs
 * @param categoryId - Category ID
 * @returns Map of SKU ID to display size
 */
export async function getPPSizeDisplayBatch(
  skuIds: string[],
  categoryId: number
): Promise<Map<string, string>> {
  const cache = await loadPPSizeCache()
  const result = new Map<string, string>()
  
  for (const skuId of skuIds) {
    const sizeCode = getSizeCodeForPrepack(skuId, categoryId)
    if (sizeCode === null) {
      const lastHyphen = skuId.lastIndexOf('-')
      result.set(skuId, lastHyphen > 0 ? skuId.substring(lastHyphen + 1) : 'O/S')
    } else {
      const displayName = cache.get(sizeCode)
      result.set(skuId, displayName ?? String(sizeCode))
    }
  }
  
  return result
}

/**
 * Clear the PPSize cache (useful for testing or after data changes)
 */
export function clearPPSizeCache(): void {
  ppSizeCache = null
}
