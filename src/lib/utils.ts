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

// ============================================================================
// Color Resolution with Fallbacks
// ============================================================================

/**
 * Common color code mappings found in SKU IDs.
 * Format: SKU often contains color code like "STYLE-RD-SIZE" where RD = Red
 */
const COLOR_CODE_MAP: Record<string, string> = {
  // Basic colors
  'RD': 'Red',
  'RED': 'Red',
  'BL': 'Blue',
  'BLU': 'Blue',
  'BLUE': 'Blue',
  'BK': 'Black',
  'BLK': 'Black',
  'BLACK': 'Black',
  'WH': 'White',
  'WHT': 'White',
  'WHITE': 'White',
  'PK': 'Pink',
  'PNK': 'Pink',
  'PINK': 'Pink',
  'GR': 'Green',
  'GRN': 'Green',
  'GREEN': 'Green',
  'YL': 'Yellow',
  'YLW': 'Yellow',
  'YELLOW': 'Yellow',
  'OR': 'Orange',
  'ORG': 'Orange',
  'ORANGE': 'Orange',
  'PR': 'Purple',
  'PRP': 'Purple',
  'PURPLE': 'Purple',
  'GY': 'Grey',
  'GRY': 'Grey',
  'GREY': 'Grey',
  'GRAY': 'Grey',
  'NV': 'Navy',
  'NVY': 'Navy',
  'NAVY': 'Navy',
  'BR': 'Brown',
  'BRN': 'Brown',
  'BROWN': 'Brown',
  'BG': 'Beige',
  'BEIGE': 'Beige',
  'CR': 'Cream',
  'CRM': 'Cream',
  'CREAM': 'Cream',
  'TN': 'Tan',
  'TAN': 'Tan',
  'IV': 'Ivory',
  'IVORY': 'Ivory',
  'GD': 'Gold',
  'GOLD': 'Gold',
  'SV': 'Silver',
  'SILVER': 'Silver',
  'TL': 'Teal',
  'TEAL': 'Teal',
  'CRL': 'Coral',
  'CORAL': 'Coral',
  'MV': 'Mauve',
  'MAUVE': 'Mauve',
  'LV': 'Lavender',
  'LAV': 'Lavender',
  'LAVENDER': 'Lavender',
  'MN': 'Mint',
  'MINT': 'Mint',
  'PC': 'Peach',
  'PEACH': 'Peach',
  'RS': 'Rose',
  'ROSE': 'Rose',
  'BRG': 'Burgundy',
  'BURGUNDY': 'Burgundy',
  'OL': 'Olive',
  'OLIVE': 'Olive',
  'KH': 'Khaki',
  'KHAKI': 'Khaki',
  'DN': 'Denim',
  'DENIM': 'Denim',
  'CH': 'Charcoal',
  'CHARCOAL': 'Charcoal',
  'AQ': 'Aqua',
  'AQUA': 'Aqua',
  'TQ': 'Turquoise',
  'TURQ': 'Turquoise',
  'TURQUOISE': 'Turquoise',
  'FU': 'Fuchsia',
  'FUCHSIA': 'Fuchsia',
  'MG': 'Magenta',
  'MAGENTA': 'Magenta',
  'LM': 'Lime',
  'LIME': 'Lime',
  'SK': 'Sky',
  'SKY': 'Sky',
  'ORCHID': 'Orchid',
  'ORCH': 'Orchid',
  'ORC': 'Orchid',
  // Multi-word / specialty
  'HTPK': 'Hot Pink',
  'HOTPINK': 'Hot Pink',
  'LTBL': 'Light Blue',
  'LTPK': 'Light Pink',
  'DKBL': 'Dark Blue',
  'DKGR': 'Dark Green',
  'MULTI': 'Multi',
  'MLT': 'Multi',
  'FLORAL': 'Floral',
  'STRIPE': 'Stripe',
  'STRP': 'Stripe',
  'PRINT': 'Print',
  'PRNT': 'Print',
}

/**
 * Try to extract color code from SKU ID.
 * SKU format is typically: STYLE-COLOR-SIZE (e.g., "ADDISON-RD-10")
 * Returns the mapped color name or null if not found.
 */
function extractColorFromSkuId(skuId: string): string | null {
  // Split by hyphen and look for color code (typically second segment)
  const parts = skuId.toUpperCase().split('-')

  // Try each part (skip first which is usually style, skip last which is usually size)
  for (let i = 1; i < parts.length - 1; i++) {
    const part = parts[i]
    if (COLOR_CODE_MAP[part]) {
      return COLOR_CODE_MAP[part]
    }
  }

  // Also try second-to-last part (for STYLE-COLOR-SIZE format)
  if (parts.length >= 2) {
    const secondToLast = parts[parts.length - 2]
    if (COLOR_CODE_MAP[secondToLast]) {
      return COLOR_CODE_MAP[secondToLast]
    }
  }

  return null
}

/**
 * Try to extract color from description.
 * Common patterns:
 * - "Product Name - Size / Color" (e.g., "Candy Cane Pant - 2/3 / Pink")
 * - "Product Name / Color / Size"
 * - "Product Name - Color"
 */
function extractColorFromDescription(description: string): string | null {
  if (!description) return null

  // Pattern 1: "... / Color" at end (most common)
  const slashMatch = description.match(/\/\s*([A-Za-z\s]+)\s*$/)
  if (slashMatch) {
    const color = slashMatch[1].trim()
    // Verify it looks like a color (not a size like "2/3")
    if (color && !/^\d/.test(color) && color.length > 1) {
      return color
    }
  }

  // Pattern 2: "... - Color" at end
  const dashMatch = description.match(/-\s*([A-Za-z\s]+)\s*$/)
  if (dashMatch) {
    const color = dashMatch[1].trim()
    // Verify it looks like a color (not a size)
    if (color && !/^\d/.test(color) && color.length > 1 && !color.match(/^[XSML]+$/i)) {
      return color
    }
  }

  return null
}

/**
 * Resolve color with fallbacks:
 * 1. Use SkuColor if available
 * 2. Try to extract from SKU ID (color codes like RD, BL, PK)
 * 3. Try to parse from Description
 *
 * @param skuColor - The SkuColor field from database
 * @param skuId - The SKU ID (e.g., "ADDISON-RD-10")
 * @param description - The product description
 * @returns The resolved color or empty string
 */
export function resolveColor(
  skuColor: string | null | undefined,
  skuId: string,
  description: string | null | undefined
): string {
  // 1. Use SkuColor if available
  if (skuColor && skuColor.trim()) {
    return skuColor.trim()
  }

  // 2. Try to extract from SKU ID
  const fromSkuId = extractColorFromSkuId(skuId)
  if (fromSkuId) {
    return fromSkuId
  }

  // 3. Try to parse from Description
  const fromDescription = extractColorFromDescription(description ?? '')
  if (fromDescription) {
    return fromDescription
  }

  return ''
}
