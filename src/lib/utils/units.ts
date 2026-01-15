/**
 * Units Per SKU Utility
 *
 * Parses the number of units from SKU prefixes for prepack products.
 * Used to calculate unit prices for normalized price comparison.
 *
 * SKU Format: "{N}PC-{style}-PP-{size}"
 * Examples:
 *   - "2PC-590P-PP-10/12" → 2 units
 *   - "3PC-ABC-PP-S" → 3 units
 *   - "SHIRT-BK-10" → 1 unit (no prefix)
 */

/**
 * Parse the number of units from a SKU string.
 *
 * Looks for patterns like "2PC-", "3PC-", "6PC-" at the start of the SKU.
 *
 * @param skuId - The SKU identifier string
 * @returns Number of units (defaults to 1 if no prepack prefix found)
 */
export function parseUnitsFromSku(skuId: string): number {
  if (!skuId) return 1

  // Match pattern: starts with digits followed by "PC-" (case insensitive)
  // Examples: "2PC-", "3PC-", "6PC-", "12PC-"
  const match = skuId.toUpperCase().match(/^(\d+)PC-/)

  if (match) {
    const units = parseInt(match[1], 10)
    // Sanity check: units should be reasonable (1-100)
    if (units > 0 && units <= 100) {
      return units
    }
  }

  return 1
}

/**
 * Calculate unit price from pack price and units.
 *
 * @param packPrice - The total price for the SKU (as string or number)
 * @param units - Number of units in the pack
 * @returns Unit price as a number, or null if invalid
 */
export function calculateUnitPrice(
  packPrice: string | number | null | undefined,
  units: number
): number | null {
  if (packPrice === null || packPrice === undefined || packPrice === '') {
    return null
  }

  const price = typeof packPrice === 'string' ? parseFloat(packPrice) : packPrice

  if (isNaN(price) || units <= 0) {
    return null
  }

  // Round to 2 decimal places
  return Math.round((price / units) * 100) / 100
}

/**
 * Check if a SKU is a prepack (has units > 1).
 *
 * @param skuId - The SKU identifier string
 * @returns true if SKU is a prepack
 */
export function isPrepackSku(skuId: string): boolean {
  return parseUnitsFromSku(skuId) > 1
}
