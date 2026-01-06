# PreOrder Showing Only 3 Sizes

## Priority: LOW

## Problem

Devika mentioned PreOrder items showing only 3 sizes instead of all available sizes. She expected to see all sizes that exist in Shopify.

## Current Implementation

- `src/lib/data/queries/preorder.ts` - Fetches PreOrder products from Sku table
- `src/lib/utils/size-sort.ts` - Sorts sizes in correct order
- Size sorting IS implemented and working

## Investigation Steps

### 1. Check if it's a data issue
Query the database for a specific product:
```sql
SELECT SkuID, Size, Quantity 
FROM Sku 
WHERE SkuID LIKE 'EMMI-%' 
  AND ShowInPreOrder = 1
ORDER BY SkuID, Size
```

### 2. Compare with Shopify
Go to Shopify admin and check how many sizes EMMI actually has:
- `admin.shopify.com/store/limeappleonline/products/[id]`

### 3. Check transform logic
In `src/lib/shopify/sync.ts` around line 850, verify:
- Are all sizes being inserted?
- Is there any filtering that removes sizes?
- Is `ShowInPreOrder` being set correctly?

### 4. Check the query
In `src/lib/data/queries/preorder.ts`, verify:
- Is there a LIMIT clause?
- Is there filtering on Quantity > 0?
- Are all variants being grouped correctly?

## Potential Causes

1. **Data issue** - Only 3 sizes exist in Shopify for that product
2. **Transform filtering** - Sizes with 0 quantity being excluded
3. **Query filtering** - PreOrder query has unexpected WHERE clause
4. **Grouping issue** - Variants not being grouped correctly by base SKU

## Files to Check

```
src/lib/shopify/sync.ts           # Transform logic
src/lib/data/queries/preorder.ts  # PreOrder query
src/lib/utils/size-sort.ts        # Size sorting (probably not the issue)
```

## Effort Estimate
- Investigation: 30 minutes
- Fix (if code issue): 30 minutes
- Fix (if data issue): N/A - need to update Shopify
