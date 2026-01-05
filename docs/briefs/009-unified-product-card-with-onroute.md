# Brief 009: Unified ProductCard with OnRoute Support

## Objective

Unify the ATS and PreOrder product card components into a single `ProductOrderCard` that:
1. Displays OnRoute quantities (matching .NET behavior)
2. Allows ordering against OnRoute inventory
3. Provides hybrid input UX (tap-to-add + manual entry)
4. Maintains the modern, polished UI we've built

## Background

### Current State

| Component | File | UX Pattern | Shows OnRoute | Qty Cap |
|-----------|------|------------|---------------|---------|
| ATS | `product-order-card.tsx` | Tap-to-add SizeChips | No | `available` |
| PreOrder | `preorder-product-grid.tsx` | Input + Add button | Yes | None (9999) |

### .NET Behavior

Both ATS and PreOrder in .NET:
- Display OnRoute in a separate row below Available
- Allow ordering up to `max(available, onRoute)`
- Use input fields for quantity entry

### Business Context

| Field | Meaning |
|-------|---------|
| `Available` (Sku.Quantity) | Units in warehouse, ready to ship now |
| `OnRoute` (Sku.OnRoute) | Units in transit to warehouse, ship when arrived |

Buyers can order against OnRoute inventory. Those orders fulfill when the shipment arrives.

## Requirements

### R1: Display OnRoute Quantities
- Show OnRoute value per size variant
- Visual distinction from Available (e.g., different color, icon, or label)
- Only show OnRoute row/indicator when `onRoute > 0` for any variant

### R2: Quantity Cap Logic
- Change from: `currentQty >= variant.available`
- Change to: `currentQty >= Math.max(variant.available, variant.onRoute)`

### R3: Hybrid Input UX
- **Primary**: Keep tap-to-add on SizeChip (tap = +1)
- **Secondary**: Add manual quantity input option
- **Trigger**: Long-press on chip OR click expansion icon OR click ordered quantity
- **Input UI**: Small popover/modal with number input and confirm button

### R4: Low Stock Indicator Update
- Current: `available <= 6` shows "Low Stock"
- Update: Consider `max(available, onRoute)` for determining stock status
- If `available = 0` but `onRoute > 0`, show as orderable (not out of stock)

### R5: Unified Card Usage
- ATS pages use `ProductOrderCard`
- PreOrder pages use same `ProductOrderCard`
- Delete `preorder-product-grid.tsx` after migration

## Data Layer (Already Done)

The data layer already supports this:

```typescript
// src/lib/types/inventory.ts
interface ProductVariant {
  size: string;
  sku: string;
  available: number;
  onRoute: number;  // Already exists
  priceCad: number;
  priceUsd: number;
}
```

```typescript
// src/lib/data/queries/skus.ts - ATS query
const variants: ProductVariant[] = skuGroup.map(sku => ({
  // ...
  available: sku.Quantity ?? 0,
  onRoute: sku.OnRoute ?? 0,  // Already fetched
}))
```

## Implementation Plan

### Phase 1: Update ProductOrderCard

**File: `src/components/buyer/product-order-card.tsx`**

#### 1.1 Update quantity cap logic

```typescript
// Before (line 42-43)
if (variant.available === 0) return;
if (currentQty >= variant.available) return;

// After
const maxOrderable = Math.max(variant.available, variant.onRoute);
if (maxOrderable === 0) return;
if (currentQty >= maxOrderable) return;
```

#### 1.2 Update handleQuantityChange cap

```typescript
// Before (line 58)
const newQty = Math.max(0, Math.min(currentQty + delta, variant.available));

// After
const maxOrderable = Math.max(variant.available, variant.onRoute);
const newQty = Math.max(0, Math.min(currentQty + delta, maxOrderable));
```

#### 1.3 Update availableVariants filter

```typescript
// Before (line 72)
const availableVariants = product.variants.filter((v) => v.available > 0);

// After
const orderableVariants = product.variants.filter(
  (v) => v.available > 0 || v.onRoute > 0
);
```

#### 1.4 Update low stock logic

```typescript
// Before (line 75-77)
const hasLowStock = availableVariants.some(
  (v) => v.available > 0 && v.available <= STOCK_THRESHOLDS.LOW
);

// After
const hasLowStock = orderableVariants.some((v) => {
  const maxQty = Math.max(v.available, v.onRoute);
  return maxQty > 0 && maxQty <= STOCK_THRESHOLDS.LOW;
});
```

### Phase 2: Update SizeChip Component

**File: `src/components/buyer/size-chip.tsx`**

#### 2.1 Add onRoute prop

```typescript
interface SizeChipProps {
  size: string;
  available: number;
  onRoute: number;  // Add this
  orderedQty: number;
  onTap: () => void;
  onQuantityChange: (delta: number) => void;
  onManualEntry?: (qty: number) => void;  // Add for manual input
}
```

#### 2.2 Display OnRoute indicator

When `onRoute > 0`, show a small indicator on the chip:
- Could be a small badge/dot
- Or show "5 + 10" format (available + onRoute)
- Or tooltip on hover

#### 2.3 Add manual entry trigger

- Long-press (500ms) opens quantity input popover
- Or small expand icon appears on hover
- Popover contains: number input, current qty display, confirm/cancel buttons

### Phase 3: Create QuantityInputPopover Component

**File: `src/components/buyer/quantity-input-popover.tsx`**

```typescript
interface QuantityInputPopoverProps {
  size: string;
  currentQty: number;
  maxQty: number;
  available: number;
  onRoute: number;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}
```

Features:
- Number input field (type="number")
- Shows "Available: X" and "On Route: Y"
- Shows "Max: Z"
- +/- buttons for increment/decrement
- Confirm and Cancel buttons
- Closes on click outside

### Phase 4: Migrate PreOrder Pages

**Files to update:**
- `src/app/buyer/pre-order/[collection]/page.tsx`

**Changes:**
1. Import `ProductOrderCard` instead of `PreOrderProductGrid`
2. Transform `PreOrderProduct` to `Product` type (or update card to accept either)
3. Pass ship window info via page header (already done)

**File to delete:**
- `src/components/buyer/preorder-product-grid.tsx`

### Phase 5: Type Alignment (if needed)

Ensure `Product` and `PreOrderProduct` types are compatible, or create adapter:

```typescript
// Option A: Use Product type everywhere
// Option B: Create union type
// Option C: ProductOrderCard accepts both via props
```

Recommend Option A: Standardize on `Product` type, update PreOrder query to return `Product[]`.

## Visual Design

### SizeChip with OnRoute

```
┌─────────────────┐
│  6              │  ← Size
│  5 + 10         │  ← "available + onRoute" or just show available
│  ███░░ (2)      │  ← Progress bar + ordered qty
└─────────────────┘
```

Or simpler approach - show OnRoute as subtle indicator:

```
┌─────────────────┐
│  6        ⟳    │  ← Size + OnRoute icon when onRoute > 0
│  5              │  ← Available
│  ███░░ (2)      │  ← Progress bar + ordered qty
└─────────────────┘
```

### Quantity Input Popover

```
┌────────────────────────────┐
│ Size 6                     │
├────────────────────────────┤
│ Available:  5              │
│ On Route:   10             │
│ Max Order:  10             │
├────────────────────────────┤
│  [-]  ┌─────┐  [+]        │
│       │  7  │              │
│       └─────┘              │
├────────────────────────────┤
│  [Cancel]    [Confirm]     │
└────────────────────────────┘
```

## Files Changed

| File | Action |
|------|--------|
| `src/components/buyer/product-order-card.tsx` | Modify - add OnRoute logic |
| `src/components/buyer/size-chip.tsx` | Modify - add OnRoute display + manual entry |
| `src/components/buyer/quantity-input-popover.tsx` | Create - new component |
| `src/app/buyer/pre-order/[collection]/page.tsx` | Modify - use ProductOrderCard |
| `src/components/buyer/preorder-product-grid.tsx` | Delete |
| `src/lib/data/queries/preorder.ts` | Modify - return `Product[]` type |

## Testing Checklist

- [ ] ATS: Can order up to available qty (tap)
- [ ] ATS: Can order up to onRoute qty when available=0 (tap)
- [ ] ATS: Manual entry works via long-press
- [ ] ATS: Low stock shows correctly with OnRoute consideration
- [ ] ATS: OnRoute indicator visible when onRoute > 0
- [ ] PreOrder: Same card renders correctly
- [ ] PreOrder: Ship window still shows in page header
- [ ] PreOrder: Can order beyond available (against OnRoute)
- [ ] Both: Order totals calculate correctly
- [ ] Both: Undo works
- [ ] Both: Mobile responsive

## Open Questions

1. **OnRoute visual treatment**: Badge? Icon? Combined number? Need design decision.

2. **Manual entry trigger**: Long-press vs click icon vs click on ordered qty? Recommend long-press + click on qty number.

3. **isOnRoute tracking**: Should we track which order lines are fulfilled from OnRoute inventory? (For warehouse routing.) If yes, add to `PreOrderItemMetadata`:
   ```typescript
   interface OrderLineMetadata {
     isOnRoute: boolean;
     // ... existing fields
   }
   ```

## Out of Scope

- Admin editing of OnRoute quantities (already exists in /admin/inventory)
- Ship window editing on categories (already exists)
- Order submission changes (handled separately)
