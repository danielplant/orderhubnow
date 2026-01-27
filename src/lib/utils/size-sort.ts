/**
 * Size ordering utility for Limeapple products.
 *
 * Configurable via Admin Settings → Size Order.
 * Uses raw size strings from Shopify metafields (no normalization).
 * Supports aliases for mapping format variants without modifying stored data.
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

// ============================================================================
// Runtime Cache for Size Aliases
// ============================================================================

/**
 * Cached alias map from database config.
 * Maps raw Shopify size strings to canonical sizes for sorting.
 * Set to null when cache should be invalidated.
 */
let cachedAliasMap: Map<string, string> | null = null;

/**
 * Invalidate the size alias cache.
 * Call this after admin saves/deletes an alias.
 */
export function invalidateSizeAliasCache(): void {
  cachedAliasMap = null;
}

/**
 * Set the size alias cache directly.
 * Used by loadSizeAliasConfig() after fetching from DB.
 */
export function setSizeAliasCache(aliases: { raw: string; canonical: string }[]): void {
  cachedAliasMap = new Map(aliases.map(a => [a.raw, a.canonical]));
}

/**
 * Get the current alias map (cached or empty).
 * Synchronous for use in sorting functions.
 */
function getAliasMap(): Map<string, string> {
  return cachedAliasMap ?? new Map();
}

/**
 * Load size alias configuration from database and cache it.
 * Call this before sortBySize() in query functions to ensure
 * the admin-configured aliases are used.
 *
 * Safe to call multiple times - only loads if cache is empty.
 */
export async function loadSizeAliasConfig(): Promise<void> {
  // Skip if already cached
  if (cachedAliasMap !== null) return;

  try {
    const rows = await prisma.sizeAlias.findMany({
      select: { RawSize: true, CanonicalSize: true },
    });
    cachedAliasMap = new Map(rows.map(r => [r.RawSize, r.CanonicalSize]));
  } catch (err) {
    console.error('[loadSizeAliasConfig] Failed to load aliases:', err);
    cachedAliasMap = new Map();
  }
}

// ============================================================================
// Sorting Logic
// ============================================================================

/**
 * Get the canonical size for a raw size string.
 * Uses alias mapping if one exists, otherwise returns raw size.
 */
function getCanonicalSize(raw: string): string {
  return getAliasMap().get(raw) ?? raw;
}

/**
 * Get the sort index for a size string.
 * Applies alias mapping, then looks up in the size order list (case-insensitive).
 * Returns a high number for unknown sizes so they sort to the end.
 */
function getSizeIndex(size: string): number {
  if (!size) return 9999;
  const canonical = getCanonicalSize(size);
  const upper = canonical.toUpperCase();
  const index = getSizeOrder().findIndex(s => s.toUpperCase() === upper);

  if (index < 0) {
    // Log warning if this was an aliased size (orphaned alias)
    if (canonical !== size) {
      console.warn(
        `[size-sort] Orphaned alias detected: "${size}" → "${canonical}" (canonical not in size order)`
      );
    }
  }

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
