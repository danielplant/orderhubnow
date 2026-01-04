import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Focus ring utility class string.
 * Apply to interactive elements for consistent keyboard focus indication.
 */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Format a number as USD currency.
 */
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

// Gebbia-esque Gradients: Soft, airy, premium.
// We hash the string to consistently pick the same gradient for the same category name.
const GRADIENTS = [
  "from-rose-100 to-teal-100",
  "from-orange-100 to-rose-100",
  "from-blue-100 to-violet-100",
  "from-fuchsia-100 to-pink-100",
  "from-emerald-100 to-yellow-100",
  "from-indigo-100 to-cyan-100",
  "from-slate-100 to-stone-100",
  "from-amber-100 to-lime-100",
];

export function getCategoryGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

/**
 * Apply prepack multiplier to quantity.
 * Matches .NET logic from Report.aspx.cs:
 * - pp- + 2pc → ×2
 * - pp- + 3pc → ×3
 * - pp- (else) → ×6
 */
export function getEffectiveQuantity(skuId: string, qty: number): number {
  const lower = skuId.toLowerCase();
  if (lower.includes('pp-')) {
    if (lower.includes('2pc')) return qty * 2;
    if (lower.includes('3pc')) return qty * 3;
    return qty * 6;
  }
  return qty;
}

/**
 * Format a number with commas for display (e.g., 1234567 → "1,234,567")
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format currency with symbol (e.g., 1234.56 → "$1,234.56")
 */
export function formatCurrency(amount: number, currency: 'USD' | 'CAD' = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parse price string to number (handles "$29.99", "29.99", null, etc.)
 * Shared helper for SKU price columns which are stored as strings.
 */
export function parsePrice(value: string | null | undefined): number {
  if (!value) return 0
  const clean = value.replace(/[^\d.]/g, '')
  const parsed = parseFloat(clean)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Parse SKU ID to extract BaseSku and ParsedSize.
 * Matches .NET logic from the vw_SkuWithSize SQL view:
 * - ParsedSize = text after last hyphen
 * - BaseSku = text before last hyphen
 * 
 * Examples:
 *   "ABC-123-S"  → { baseSku: "ABC-123", parsedSize: "S" }
 *   "ABC-123-2T" → { baseSku: "ABC-123", parsedSize: "2T" }
 *   "ABC123"     → { baseSku: "ABC123", parsedSize: "ABC123" }
 */
export function parseSkuId(skuId: string): { baseSku: string; parsedSize: string } {
  const lastHyphenIndex = skuId.lastIndexOf('-')
  if (lastHyphenIndex > 0) {
    return {
      baseSku: skuId.substring(0, lastHyphenIndex),
      parsedSize: skuId.substring(lastHyphenIndex + 1),
    }
  }
  return { baseSku: skuId, parsedSize: skuId }
}
