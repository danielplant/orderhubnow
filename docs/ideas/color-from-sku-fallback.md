# Color Swatch Fallback: Parse from SKU Suffix

## Problem

Some products in Shopify don't have the `custom.color` metafield populated, so their color swatches don't display in the UI. The UI correctly shows swatches only when `product.color` exists, but missing data means inconsistent UX.

Example:
- **WITH swatch**: ADDISON-RD (has color metafield = "RED")
- **WITHOUT swatch**: AOLANI-MU (no color metafield, but SKU suffix = "MU" = MULTI)

## Proposed Solution

Parse color code from SKU suffix as a fallback when `metafield_color` is null/empty.

### SKU Pattern
SKUs follow pattern: `{BASE}-{COLOR_CODE}` (e.g., `ADDISON-RD`, `DINA-AM`, `582P-AT`)

### Color Code Mapping
```typescript
const SKU_COLOR_CODES: Record<string, string> = {
  // Common codes
  'RD': 'RED',
  'BK': 'BLACK',
  'BW': 'BLACK',      // Black/White
  'WT': 'WHITE',
  'BU': 'BLUE',
  'PK': 'PINK',
  'PU': 'PURPLE',
  'AM': 'PURPLE',     // Amethyst
  'OR': 'ORANGE',
  'OG': 'ORANGE',
  'GR': 'GREEN',
  'YL': 'YELLOW',
  'NC': 'ASSORTED',   // Neon Citrus
  'MU': 'MULTI',
  'AT': 'MULTI',      // Assorted
  'FC': 'FUCHSIA',
  'CP': 'PINK',       // Candy Pink
  'LM': 'LIME',
  'TQ': 'TURQUOISE',
  'NV': 'NAVY',
  'CO': 'CORAL',
  // Add more as discovered
};
```

## Implementation

### Option A: Transform-time (Recommended)
Add fallback in `transformToSkuTable()` when building SkuColor:

```typescript
// In src/lib/shopify/sync.ts transformToSkuTable()
function parseColorFromSku(skuId: string): string | null {
  const parts = skuId.split('-');
  if (parts.length < 2) return null;
  const suffix = parts[parts.length - 1].toUpperCase();
  return SKU_COLOR_CODES[suffix] || null;
}

// Use in transform:
SkuColor: (r.metafield_color || '').replace(/[\[\]"]/g, '') 
          || parseColorFromSku(r.SkuID) 
          || null,
```

### Option B: UI-time
Add fallback in the ProductOrderCard component:

```typescript
// Fallback if no color from DB
const displayColor = product.color || parseColorFromSku(product.skuBase);
{displayColor && <ColorSwatch color={displayColor} />}
```

## Effort Estimate
- 30 minutes implementation
- 15 minutes testing

## Priority
Low - cosmetic improvement, doesn't affect functionality

## References
- Color swatch component: `src/components/ui/color-swatch.tsx`
- Color hex mapping: `src/lib/constants/colors.ts`
- Transform logic: `src/lib/shopify/sync.ts` line ~850
