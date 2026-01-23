/**
 * Size ordering utility for Limeapple products.
 * Matches .NET logic from Utilities/Utilities.cs
 *
 * Updated to include full size range per Devika's list:
 * - Baby/Toddler months: 0/6M, 6/12M, 12/18M, 18/24M
 * - Toddler/Kids: 2T, 2/3, 3T, 4, 4/5, 5, 5/6, 6, 6/6X, 6/7, 7, 7/8, 8, 10, 10/12, 12, 14, 14/16, 16
 * - Women/Girls letters: XXS, XS, S, M, L, XL, XXL
 *
 * Configurable via Admin Settings → Size Order.
 * When no config exists, falls back to DEFAULT_SIZE_ORDER.
 */

import { prisma } from '@/lib/prisma'

// ============================================================================
// Default Size Order (fallback when no config exists)
// ============================================================================

/**
 * Default size order from smallest to largest.
 * Covers: Baby months → Toddler → Kids → Teen → Ladies/Girls letters
 * Exported for use by admin UI to show defaults.
 */
export const DEFAULT_SIZE_ORDER: string[] = [
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
  'XXXS', 'XXS', 'XS', 'S', 'M', 'M/L', 'L', 'XL', 'XXL',
  // Letter sizes with parenthetical numeric (small to large)
  'XS/S(4-6)', 'XS/S(6-8)', 'XS(6/6X)', 'S(7/8)', 'M/L(7-16)', 'M/L(10-16)', 'M(10/12)', 'L(14/16)',
  // Junior sizes
  'JR-XS', 'JR-S', 'JR-M', 'JR-L', 'JR-XL',
  // One-size
  'O/S'
];

// ============================================================================
// Runtime Cache for Configurable Size Order
// ============================================================================

/**
 * Cached size order from database config.
 * Set to null when cache should be invalidated.
 * Falls back to DEFAULT_SIZE_ORDER when null.
 */
let cachedSizeOrder: string[] | null = null;

/**
 * Invalidate the size order cache.
 * Call this after admin saves new size order config.
 */
export function invalidateSizeOrderCache(): void {
  cachedSizeOrder = null;
}

/**
 * Set the size order cache directly.
 * Used by loadSizeOrderConfig() after fetching from DB.
 */
export function setSizeOrderCache(sizes: string[]): void {
  cachedSizeOrder = sizes;
}

/**
 * Get the current size order (cached or default).
 * Synchronous for use in sorting functions.
 */
function getSizeOrder(): string[] {
  return cachedSizeOrder ?? DEFAULT_SIZE_ORDER;
}

/**
 * Load size order configuration from database and cache it.
 * Call this before sortBySize() in query functions to ensure
 * the admin-configured size order is used.
 *
 * Safe to call multiple times - only loads if cache is empty.
 */
export async function loadSizeOrderConfig(): Promise<void> {
  // Skip if already cached
  if (cachedSizeOrder !== null) return;

  try {
    const row = await prisma.sizeOrderConfig.findFirst();
    if (row?.Sizes) {
      const sizes = JSON.parse(row.Sizes) as string[];
      cachedSizeOrder = sizes;
    } else {
      // No config in DB, use defaults (and cache them to avoid repeated queries)
      cachedSizeOrder = DEFAULT_SIZE_ORDER;
    }
  } catch (err) {
    console.error('[loadSizeOrderConfig] Failed to load, using defaults:', err);
    cachedSizeOrder = DEFAULT_SIZE_ORDER;
  }
}

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
 * Normalizes before checking against current size order (cached or default).
 */
function isKnownSize(s: string): boolean {
  const normalized = normalizeSize(s);
  return getSizeOrder().some(size => size.toUpperCase() === normalized);
}

/**
 * Strip prepack suffix like "(PP 2pc)" from size strings.
 * Examples:
 * - "10/12(PP 2pc)" → "10/12"
 * - "6/6X(PP 2pc)" → "6/6X"
 * - "O/S" → "O/S" (unchanged)
 */
function stripPrepackSuffix(size: string): string {
  // Remove (PP Xpc) suffix - matches patterns like "(PP 2pc)", "(PP 3pc)", etc.
  return size.replace(/\s*\(PP\s*\d+pc\)\s*$/i, '').trim();
}

/**
 * Extract just the size from a Shopify variant title.
 * Shopify variant titles may be formatted as:
 * - "5/6 / Black" (Size / Color)
 * - "Fuchsia / 4" (Color / Size)
 * - "5/6" (Size only)
 * - "10/12(PP 2pc)" (Size with prepack suffix)
 *
 * This function detects which part is the size and returns just that.
 * Also normalizes the size (e.g., "12-18M" → "12/18M") and strips prepack suffixes.
 */
export function extractSize(variantTitle: string): string {
  if (!variantTitle) return '';

  // First strip any prepack suffix
  const cleaned = stripPrepackSuffix(variantTitle);

  // If it doesn't contain " / ", normalize and return as-is
  if (!cleaned.includes(' / ')) {
    return normalizeSize(cleaned);
  }

  const parts = cleaned.split(' / ').map(p => p.trim());

  // Helper to check if a part looks like a size (including parenthetical format like "XS(6/6X)")
  const looksLikeSize = (s: string): boolean => {
    // Check if it's a known size directly
    if (isKnownSize(s)) return true;
    // Check for parenthetical format: "XS(6/6X)", "S(7/8)", "M(10/12)", "L(14/16)"
    const parenMatch = s.match(/^([A-Z]{1,3})\s*\(/i);
    if (parenMatch && isKnownSize(parenMatch[1])) return true;
    // Check if it starts with a number (like "6/6X", "7/8", "10/12")
    if (/^\d/.test(s)) return true;
    return false;
  };

  // Check first part - if it looks like a size, use it
  if (parts[0] && looksLikeSize(parts[0])) {
    return normalizeSize(parts[0]);
  }

  // Check second part - if it looks like a size, use it (reversed format: Color / Size)
  if (parts[1] && looksLikeSize(parts[1])) {
    return normalizeSize(parts[1]);
  }

  // Neither is a standard size (e.g., "M/L - size 7 to 16 / Black")
  // Return first part normalized as fallback
  return normalizeSize(parts[0]) || variantTitle.trim();
}

/**
 * Get the sort index for a size string.
 * Automatically extracts and normalizes the size from variant titles.
 * Uses current size order (cached or default).
 * Returns a high number for unknown sizes so they sort to the end.
 */
function getSizeIndex(size: string): number {
  // Extract clean size from variant titles like "5/6 / Black"
  const cleanSize = extractSize(size);
  // Already normalized by extractSize, but normalize again for safety
  const normalized = normalizeSize(cleanSize);
  const index = getSizeOrder().findIndex(s => s.toUpperCase() === normalized);
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
