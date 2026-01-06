# Wrong Product Titles/Images

## Priority: MEDIUM (may already be fixed)

## Problem

Devika's screenshot showed:
1. Product title should be "CUDDLE BUBBLE HOODIE" but showing different text
2. Image showing wrong colorway (e.g., black variant showing pink image)

**Note**: Screenshots showed `DU3EMMI-PK`, `DU3600C-BG` - these are OLD SKUs with DU3 prefix from the .NET sync. The new sync produces clean SKUs. **This may already be fixed after the new sync runs.**

## Context

Shopify has these metafields:
- `Label Title` = "CUDDLE BUBBLE HOODIE" (product display name)
- `custom.order_entry_description` = product description

The sync should be reading:
- `mfOrderEntryDescription` for description
- `DisplayName` from variant for title

## Investigation Steps

### 1. Verify if already fixed
After new sync runs (or trigger manually), check:
- Do products now show correct titles?
- Do variant images match the color?

### 2. Check what fields are being used
In `src/lib/shopify/sync.ts`, check:
```typescript
// Around line 850 in transform
Description: r.metafield_order_entry_description || r.DisplayName || '',
```

### 3. Check image URL logic
```typescript
// Check how ShopifyImageURL is set
ShopifyImageURL: r.ShopifyProductImageURL || null
```

Is it using:
- Variant-specific image? (correct)
- Product-level image? (may show wrong color)

### 4. Query to check current data
```sql
SELECT TOP 20 
  SkuID, 
  Description, 
  ShopifyImageURL,
  OrderEntryDescription
FROM Sku 
WHERE SkuID LIKE 'EMMI-%'
```

## Potential Causes

1. **Old data** - Screenshots from before new sync (DU3 prefix visible)
2. **Wrong metafield** - Using product description instead of Label Title
3. **Image inheritance** - Using product image instead of variant image
4. **Multi-colorway products** - Bilal mentioned issues with products that have multiple colorways in one listing

## Files to Check

```
src/lib/shopify/sync.ts           # Line ~200 (JSONL parsing), ~850 (transform)
src/lib/data/queries/skus.ts      # How products are fetched for display
src/components/buyer/product-order-card.tsx  # How title/image displayed
```

## GraphQL Query Check

The bulk operation query should be fetching variant images:
```graphql
variants {
  image {
    url
  }
}
```

Verify this is in `BULK_OPERATION_QUERY` in `src/lib/shopify/sync.ts`.

## Effort Estimate
- Verification: 15 minutes (check if already fixed)
- Fix (if needed): 1-2 hours
