# Old Order SKU Compatibility

## Priority: HIGH

## Problem

Old orders in `CustomerOrdersItems` reference SKUs with DU3/DU9 prefix (e.g., `DU3ADDISON-RD`). The new Shopify sync produces clean SKUs without the prefix (e.g., `ADDISON-RD`).

**Risk**: When viewing old orders, if the code joins to the Sku table, lookups will fail because:
- Old order line item: `DU3ADDISON-RD`
- New Sku table: `ADDISON-RD` (no match)

## Questions to Investigate

1. When viewing an old order, does it join to the Sku table? 
2. Is `CustomerOrdersItems.SKU` used for joins or just display?
3. What breaks if the SKU doesn't exist in the Sku table?

## Files to Check

- `src/lib/data/queries/orders.ts` - Order data fetching
- `src/app/api/orders/[id]/route.ts` - Order API endpoint
- `src/app/api/orders/[id]/pdf/route.ts` - Order PDF generation
- Any component displaying order line items

## Test Cases

1. Find an old order with DU3 SKUs: 
   ```sql
   SELECT TOP 10 CustomerOrderID, SKU FROM CustomerOrdersItems WHERE SKU LIKE 'DU3%'
   ```
2. Try to view that order in the admin panel
3. Try to download the PDF for that order
4. Check if product images/prices display correctly

## Potential Solutions

### Option A: Strip prefix on lookup
When looking up SKU data, strip DU3/DU9 prefix:
```typescript
function normalizeSkuId(sku: string): string {
  return sku.replace(/^DU[239]/, '');
}
```

### Option B: Keep both formats in Sku table
During transform, create entries for both:
- `ADDISON-RD` (clean)
- `DU3ADDISON-RD` (legacy alias)

### Option C: Display-only (no join needed)
If orders only store SKU as display text and don't join to Sku table, no fix needed.

## Effort Estimate
- Investigation: 30 minutes
- Fix (if needed): 1-2 hours depending on approach
