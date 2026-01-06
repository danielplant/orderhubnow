# Fabric Type Visual Indicator

## Problem

Products display fabric content as plain text (e.g., "100% POLY PLUSH", "UPF 50+, 92%POLY / 8%SPANDEX"), but there's no quick visual indicator like there is for colors. Buyers scanning products can't quickly identify fabric type at a glance.

## Proposed Solution

Add a fabric type indicator/badge similar to color swatches, showing key fabric characteristics visually.

### Option A: Fabric Category Icons
Small icons representing fabric categories:
- 🧶 Knit/Jersey
- 🪶 Plush/Fleece
- 🏊 Swim/UPF
- 🌿 Organic Cotton
- ♻️ Recycled
- 🧵 Terry

### Option B: Fabric Tags/Badges
Small colored badges for key properties:
- **UPF 50+** (blue badge) - sun protection
- **Organic** (green badge) - organic materials
- **Recycled** (teal badge) - recycled content
- **Plush** (pink badge) - soft/cozy

### Option C: Fabric Swatch (like ColorSwatch)
A small indicator with texture/pattern:
```tsx
export function FabricSwatch({ fabric }: { fabric: string }) {
  const fabricType = parseFabricType(fabric);
  return (
    <div 
      className={cn(fabricSwatchVariants({ type: fabricType }))}
      title={fabric}
      aria-label={`Fabric: ${fabric}`}
    />
  );
}
```

## Implementation

### 1. Parse fabric type from string
```typescript
function parseFabricType(fabric: string): FabricType {
  const f = fabric.toUpperCase();
  if (f.includes('UPF')) return 'swim';
  if (f.includes('PLUSH') || f.includes('FLEECE')) return 'plush';
  if (f.includes('ORGANIC')) return 'organic';
  if (f.includes('RECYCLED')) return 'recycled';
  if (f.includes('TERRY')) return 'terry';
  if (f.includes('COTTON')) return 'cotton';
  if (f.includes('POLY')) return 'polyester';
  return 'default';
}
```

### 2. Create FabricIndicator component
```tsx
// src/components/ui/fabric-indicator.tsx
const FABRIC_STYLES: Record<FabricType, { bg: string; icon: string; label: string }> = {
  swim: { bg: 'bg-blue-100', icon: '☀️', label: 'UPF 50+' },
  plush: { bg: 'bg-pink-100', icon: '🧸', label: 'Plush' },
  organic: { bg: 'bg-green-100', icon: '🌿', label: 'Organic' },
  recycled: { bg: 'bg-teal-100', icon: '♻️', label: 'Recycled' },
  terry: { bg: 'bg-amber-100', icon: '🧶', label: 'Terry' },
};

export function FabricIndicator({ fabric }: { fabric: string }) {
  const type = parseFabricType(fabric);
  const style = FABRIC_STYLES[type];
  if (!style) return null;
  
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px]', style.bg)}>
      {style.icon} {style.label}
    </span>
  );
}
```

### 3. Add to ProductOrderCard
```tsx
// In product-order-card.tsx header section
<div className="flex items-center gap-2">
  <span className="text-xs font-medium">{product.skuBase}</span>
  {product.color && <ColorSwatch color={product.color} />}
  {product.fabric && <FabricIndicator fabric={product.fabric} />}
</div>
```

## Effort Estimate
- 1-2 hours implementation
- 30 minutes testing/polish

## Priority
Low - nice-to-have UX improvement

## Mockup Concept
```
┌─────────────────────────────────────┐
│ ADDISON-RD  🔴  ☀️ UPF 50+  $27.00 │
│ CRINKLE ONE PIECE                   │
│ 92%POLY / 8%SPANDEX  MSRP $97.00   │
└─────────────────────────────────────┘
```

## References
- Color swatch for pattern: `src/components/ui/color-swatch.tsx`
- Product card: `src/components/buyer/product-order-card.tsx`
