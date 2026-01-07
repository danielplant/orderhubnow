/**
 * Normalize messy Shopify field values into clean filter options
 * Jeremy Howard style: simple lookup tables, no over-engineering
 */

// Product Type: map variations to canonical names
const PRODUCT_TYPE_MAP: Record<string, string> = {
  // Bottoms
  'shorts': 'Shorts', 'SHORTS': 'Shorts',
  'pant': 'Pants', 'PANT': 'Pants',
  'leggings': 'Leggings',
  'joggers': 'Joggers',
  'skirts': 'Skirts',
  'activewear shorts': 'Shorts',
  'activewear skirt': 'Skirts',
  'activewear pant': 'Pants',
  'boardshorts': 'Shorts',
  
  // Tops
  't-shirt': 'T-Shirts', 'T-SHIRT': 'T-Shirts',
  'tank top': 'Tank Tops', 'TANK TOP': 'Tank Tops',
  'tops': 'Tops',
  'hoodie': 'Hoodies',
  'sweater': 'Sweaters',
  'sweatshirt': 'Sweatshirts',
  'sports bra': 'Sports Bras',
  'vest': 'Vests',
  'shrug': 'Tops',
  
  // Swim
  'swim- 2 piece sets': 'Swim 2-Piece',
  'swim- one piece suits': 'Swim 1-Piece',
  'swim-cover ups': 'Swim Cover-Ups',
  'swim- rashguard set': 'Rashguards',
  'rashguard set': 'Rashguards',
  'swim': 'Swimwear',
  'swimwear': 'Swimwear',
  
  // Sleepwear & Loungewear
  'pj': 'Pajamas',
  'onesie': 'Onesies',
  'activewear onesie': 'Onesies',
  'robe': 'Robes',
  'spa wrap': 'Robes',
  'SPA WRAP': 'Robes',
  
  // Outerwear
  'jacket': 'Jackets',
  'jean jacket': 'Jackets',
  'activewear jacket': 'Jackets',
  
  // Dresses & Sets
  'dresses': 'Dresses',
  'romper': 'Rompers',
  'sets': 'Sets',
  'active legging sets': 'Sets',
  'activewear set': 'Sets',
  'tutu': 'Skirts',
  
  // Accessories & Other
  'blanket': 'Blankets',
  'sleeping bag': 'Blankets',
  'head band': 'Accessories',
  'HEAD BAND': 'Accessories',
  'sun hat': 'Accessories',
  'SUN HAT': 'Accessories',
  'accessories': 'Accessories',
  'cosmetic pouch': 'Accessories',
  
  // Gift & Packs
  'gift set': 'Gift Sets',
  'holiday gift sets': 'Gift Sets',
  'packs': 'Packs',
  'save pack': 'Packs',
  'gift cards': 'Gift Cards',
  'gift card': 'Gift Cards',
  // 'insurance' intentionally excluded - not mapped
}

// Fabric: group into simple categories
const FABRIC_PATTERNS: [RegExp, string][] = [
  [/plush|minky|teddy/i, 'Plush'],
  [/organic.*cotton|cotton.*organic/i, 'Organic Cotton'],
  [/cotton/i, 'Cotton Blend'],
  [/upf\s*50/i, 'UPF 50+ (Sun Safe)'],
  [/french terry/i, 'French Terry'],
  [/jersey/i, 'Jersey'],
  [/viscose/i, 'Viscose Blend'],
  [/satin/i, 'Satin'],
  [/nylon/i, 'Nylon Blend'],
  [/polyester|poly/i, 'Polyester Blend'],
  [/crochet/i, 'Crochet'],
]

// Color: normalize case + group similar shades
const COLOR_NORMALIZE: Record<string, string> = {
  'candy pink': 'Pink',
  'watermelon': 'Pink',
  'fuchsia': 'Fuchsia',
  'orchid': 'Purple',
  'aqua': 'Turquoise',
  'lime': 'Green',
  'coral': 'Orange',
}

export function normalizeProductType(raw: string | null): string | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  if (key in PRODUCT_TYPE_MAP) return PRODUCT_TYPE_MAP[key]
  // Title case fallback
  return raw.trim().split(' ').map(w => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export function normalizeFabric(raw: string | null): string | null {
  if (!raw) return null
  for (const [pattern, label] of FABRIC_PATTERNS) {
    if (pattern.test(raw)) return label
  }
  return 'Other'
}

export function normalizeColor(raw: string | null): string | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  if (key in COLOR_NORMALIZE) return COLOR_NORMALIZE[key]
  // Title case
  return key.charAt(0).toUpperCase() + key.slice(1)
}

// Get unique sorted filter options from array of raw values
export function getFilterOptions(values: (string | null)[], normalizer: (v: string | null) => string | null): string[] {
  const set = new Set<string>()
  for (const v of values) {
    const n = normalizer(v)
    if (n) set.add(n)
  }
  return [...set].sort()
}
