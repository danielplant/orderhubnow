/**
 * Size ordering utility for Limeapple products.
 * Matches .NET logic from Utilities/Utilities.cs
 */

// Size order from smallest to largest (matches .NET GetSkuSizesOrder)
// Includes Junior (JR) sizes for teen/tween products
const SIZE_ORDER: string[] = [
  '6/12M', '12/18M', '12/24M', '18/24M',
  '2T', '3T', '2/3T', '2/3', '2', '3', '4', '4/5', '5', '5/6',
  '6', '6/6X', '7', '7/8', '8', '10', '10/12', '12', '14', '14/16', '16',
  '18', '18/20', '20',
  'XS', 'S', 'M', 'M/L', 'L', 'XL',
  'JR-XS', 'JR-S', 'JR-M', 'JR-L', 'JR-XL',
  'O/S'
];

/**
 * Check if a string is a known size.
 */
function isKnownSize(s: string): boolean {
  const normalized = s.toUpperCase().trim();
  return SIZE_ORDER.some(size => size.toUpperCase() === normalized);
}

/**
 * Extract just the size from a Shopify variant title.
 * Shopify variant titles may be formatted as:
 * - "5/6 / Black" (Size / Color)
 * - "Fuchsia / 4" (Color / Size)
 * - "5/6" (Size only)
 *
 * This function detects which part is the size and returns just that.
 */
export function extractSize(variantTitle: string): string {
  if (!variantTitle) return '';

  // If it doesn't contain " / ", return as-is
  if (!variantTitle.includes(' / ')) {
    return variantTitle.trim();
  }

  const parts = variantTitle.split(' / ').map(p => p.trim());

  // Check first part - if it's a known size, use it
  if (parts[0] && isKnownSize(parts[0])) {
    return parts[0];
  }

  // Check second part - if it's a known size, use it (reversed format: Color / Size)
  if (parts[1] && isKnownSize(parts[1])) {
    return parts[1];
  }

  // Neither is a standard size (e.g., "M/L - size 7 to 16 / Black")
  // Return first part as fallback (likely a descriptive size)
  return parts[0] || variantTitle.trim();
}

/**
 * Get the sort index for a size string.
 * Automatically extracts the size from variant titles with color appended.
 * Returns a high number for unknown sizes so they sort to the end.
 */
function getSizeIndex(size: string): number {
  // Extract clean size from variant titles like "5/6 / Black"
  const cleanSize = extractSize(size);
  const normalized = cleanSize.toUpperCase().trim();
  const index = SIZE_ORDER.findIndex(s => s.toUpperCase() === normalized);
  return index >= 0 ? index : 9999;
}

/**
 * Sort an array of items by size.
 * @param items Array of items with a 'size' property
 * @returns Sorted array (new array, does not mutate original)
 */
export function sortBySize<T extends { size: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => getSizeIndex(a.size) - getSizeIndex(b.size));
}
