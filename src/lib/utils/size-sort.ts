/**
 * Size ordering utility for Limeapple products.
 * Matches .NET logic from Utilities/Utilities.cs
 */

// Size order from smallest to largest (matches .NET GetSkuSizesOrder)
const SIZE_ORDER: string[] = [
  '6/12M', '12/18M', '12/24M', '18/24M',
  '2T', '3T', '2/3T', '2/3', '2', '3', '4', '4/5', '5', '5/6',
  '6', '6/6X', '7', '7/8', '8', '10', '10/12', '12', '14', '14/16', '16',
  '18', '18/20', '20',
  'XS', 'S', 'M', 'M/L', 'L', 'XL',
  'O/S'
];

/**
 * Get the sort index for a size string.
 * Returns a high number for unknown sizes so they sort to the end.
 */
function getSizeIndex(size: string): number {
  const normalized = size.toUpperCase().trim();
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
