/**
 * Size ordering utility for Limeapple products.
 * Matches .NET logic from Utilities/Utilities.cs
 *
 * Updated to include full size range per Devika's list:
 * - Baby/Toddler months: 0/6M, 6/12M, 12/18M, 18/24M
 * - Toddler/Kids: 2T, 2/3, 3T, 4, 4/5, 5, 5/6, 6, 6/6X, 6/7, 7, 7/8, 8, 10, 10/12, 12, 14, 14/16, 16
 * - Women/Girls letters: XXS, XS, S, M, L, XL, XXL
 */

// Size order from smallest to largest
// Covers: Baby months → Toddler → Kids → Teen → Ladies/Girls letters
const SIZE_ORDER: string[] = [
  // Baby months (smallest first)
  '0/6M', '6/12M', '12/18M', '18/24M',
  // Toddler
  '2T', '3T', '2/3T', '2/3', '2', '3',
  // Kids numeric
  '4', '4/5', '5', '5/6', '6', '6/6X', '6/7', '7', '7/8', '8',
  '10', '10/12', '12', '14', '14/16', '16',
  // Teen/Adult numeric
  '18', '18/20', '20',
  // Letter sizes (small to large)
  'XXS', 'XS', 'S', 'M', 'M/L', 'L', 'XL', 'XXL',
  // Junior sizes
  'JR-XS', 'JR-S', 'JR-M', 'JR-L', 'JR-XL',
  // One-size
  'O/S'
];

/**
 * Normalize a size string for consistent matching.
 * - Converts hyphens to slashes in month sizes: "12-18M" → "12/18M"
 * - Trims whitespace
 * - Converts to uppercase
 */
function normalizeSize(raw: string): string {
  if (!raw) return '';

  let s = raw.trim().toUpperCase();

  // Convert hyphenated month sizes to slash format: 0-6M → 0/6M, 12-18M → 12/18M, etc.
  // Pattern: digit(s) + hyphen + digit(s) + M
  s = s.replace(/^(\d+)-(\d+M)$/i, '$1/$2');

  return s;
}

/**
 * Check if a string is a known size.
 * Normalizes before checking.
 */
function isKnownSize(s: string): boolean {
  const normalized = normalizeSize(s);
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
 * Also normalizes the size (e.g., "12-18M" → "12/18M").
 */
export function extractSize(variantTitle: string): string {
  if (!variantTitle) return '';

  // If it doesn't contain " / ", normalize and return as-is
  if (!variantTitle.includes(' / ')) {
    return normalizeSize(variantTitle);
  }

  const parts = variantTitle.split(' / ').map(p => p.trim());

  // Check first part - if it's a known size (after normalization), use it
  if (parts[0] && isKnownSize(parts[0])) {
    return normalizeSize(parts[0]);
  }

  // Check second part - if it's a known size, use it (reversed format: Color / Size)
  if (parts[1] && isKnownSize(parts[1])) {
    return normalizeSize(parts[1]);
  }

  // Neither is a standard size (e.g., "M/L - size 7 to 16 / Black")
  // Return first part normalized as fallback
  return normalizeSize(parts[0]) || variantTitle.trim();
}

/**
 * Get the sort index for a size string.
 * Automatically extracts and normalizes the size from variant titles.
 * Returns a high number for unknown sizes so they sort to the end.
 */
function getSizeIndex(size: string): number {
  // Extract clean size from variant titles like "5/6 / Black"
  const cleanSize = extractSize(size);
  // Already normalized by extractSize, but normalize again for safety
  const normalized = normalizeSize(cleanSize);
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
