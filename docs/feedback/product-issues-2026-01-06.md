# OHN Product Issues - Feedback Document
**Date:** January 6, 2026
**Status:** Research Complete - Pending Implementation

---

## Issue #1: Remove SKU Warehouse Prefixes (DU2, DU3, DU9)

### Problem
SKUs are displaying with warehouse prefixes (DU2, DU3, DU9) that were added by Bilal when there were 2 warehouses (US and Canada). This legacy logic is no longer needed.

### Research Findings

**Where prefixes are handled:**
- **File:** `src/lib/data/queries/shopify.ts` (Lines 301-342)
- **Function:** `findShopifyVariant()` - strips prefixes when matching to Shopify

**Current behavior:**
```typescript
// Strips first 2 characters (e.g., "DU" from "DU2-SKU-123")
const suffix2 = skuCode.substring(2)
// Then tries stripping first 3 characters (e.g., "DU3" from "DU3-SKU-123")
const suffix3 = skuCode.substring(3)
```

**Where SKUs are stored:**
- **File:** `src/lib/data/actions/orders.ts` (Lines 284, 532)
- SKUs are stored as-is from buyer submission without transformation

**Database tables involved:**
- `SkuQuantity` - Links SKUs to warehouses
- `Warehouses` - Warehouse definitions (ID, Name)
- `CustomerOrdersItems.SKU` - Stores prefixed SKUs

### Changes Required
1. Identify where SKU prefixes are being added to the display
2. Strip prefixes when displaying SKUs to buyers
3. Determine if prefixes should be removed at data entry or display time

---

## Issue #2: Organize Sizes from Small to Big

### Problem
Sizes are not displayed in logical order. User wants:
- **Apparel:** XXS, XS, S, M, L, XL, XXL
- **Baby/Kids:** 0/6M, 6/12M, 12/18M, 18/24M, 2T, 2/3, 3T, 4, 4/5, 5, 6, 6/6X, 7, 7/8, 8, 10, 10/12, 12, 14, 14/16, 16
- **Other:** 5/6, 7/8, 10/12, 14/16, S, M, L

### Research Findings

**Current size sorting (PreOrder only):**
- **File:** `src/lib/data/queries/preorder.ts` (Lines 230-238)
```typescript
variants: data.variants.sort((a, b) => {
  const aNum = parseInt(a.size, 10)
  const bNum = parseInt(b.size, 10)
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
  if (!isNaN(aNum)) return -1
  if (!isNaN(bNum)) return 1
  return a.size.localeCompare(b.size)
})
```

**ATS has NO size sorting:**
- **File:** `src/lib/data/queries/skus.ts` (Lines 40-68)
- Variants returned in database order (no sorting applied)

**Display component:**
- **File:** `src/components/buyer/product-order-card.tsx` (Lines 228-323)
- Does not sort - uses whatever order is received

### Changes Required
1. Create a size ordering constant/function with the desired sequences
2. Add sorting to `src/lib/data/queries/skus.ts` for ATS products
3. Update sorting in `src/lib/data/queries/preorder.ts` to use new order
4. Consider making size order configurable or stored in database

---

## Issue #3: Incorrect Product Titles and Images (Cozy Section)

### Problem
- First item title should be "Cuddle Bubble Hoodie" (not reading metafield correctly)
- Second item showing wrong image (should be black cuddle bubble hoodie)
- Question: Can we get all product info from Shopify instead of old system?

### Research Findings

**Current data source (ATS & Preorder):**
- **File:** `src/lib/data/queries/skus.ts` and `preorder.ts`
- Uses local database `SKU` table, NOT direct Shopify API
- Title comes from: `OrderEntryDescription` → `Description` → `baseSku` (fallback chain)
- Image comes from: `ShopifyImageURL` field

**Shopify sync flow:**
```
Shopify Store → Bulk Operation → RawSkusFromShopify table → ??? → SKU table
```

**Gap identified:** Data may not be syncing from `RawSkusFromShopify` to main `SKU` table

**Metafield reading exists but UNUSED:**
- **File:** `src/app/actions/inventory.ts` (Lines 250-338)
- **Function:** `fetchProductPage()` reads metafield `custom.label_title`
- **Function:** `getProductsByCategory()` (Lines 414-558) - NOT used by buyer pages

**Sync files:**
- `src/lib/shopify/sync.ts` - Bulk operation, stores to RawSkusFromShopify
- `src/app/api/webhooks/shopify/bulk-complete/route.ts` - Webhook consumer

### Changes Required
1. **Option A:** Sync `label_title` metafield from Shopify to `SKU.OrderEntryDescription`
2. **Option B:** Switch buyer pages to use `getProductsByCategory()` from Shopify directly
3. Verify image associations in Shopify (each product needs correct featured image)
4. Create sync job to transfer `RawSkusFromShopify` data to `SKU` table

---

## Issue #4: Blank PDF Downloads

### Problem
Order confirmation PDFs are downloading blank (reference: A8108-Confirmation.pdf)

### Research Findings

**PDF Generation Stack:**
- **Engine:** `src/lib/pdf/generate.ts` (Puppeteer Core + @sparticuz/chromium)
- **Template:** `src/lib/pdf/order-confirmation.ts` (409 lines of HTML/CSS)
- **API:** `src/app/api/orders/[id]/pdf/route.ts`

**Potential causes identified:**

1. **Network timeout (MOST LIKELY):**
   - Line 70: `waitUntil: 'networkidle0'` can timeout if slow

2. **Missing data validation:**
   - No check that order items were fetched successfully
   - Silent fallbacks to empty/zero values

3. **Serverless timeout:**
   - No explicit timeout configuration
   - Large orders may timeout in Lambda/Vercel

4. **No error handling:**
   - Only `src/app/api/reports/export/route.ts` has explicit PDF error handling
   - Other routes fail silently

**Dependencies:**
```json
"@sparticuz/chromium": "^143.0.0",
"puppeteer-core": "^24.34.0"
```

### Changes Required
1. Add validation that order data exists before PDF generation
2. Add explicit error handling and logging
3. Consider adding timeout configuration
4. Test with the specific order (A8108) to identify exact failure point

---

## Issue #5: Smaller Font for Price/Title & Reduce Order Quantity Row Height

### Problem
- Price and product title font too large (title wrapping to multiple lines)
- Order quantity section/line too tall compared to other rows
- Need more space for product image

### Research Findings

**Current styling:**
- **File:** `src/components/buyer/product-order-card.tsx`

| Element | Current Class | Current Size |
|---------|--------------|--------------|
| Price | `text-lg font-bold` | 18px |
| Title | `text-sm font-semibold` | 14px |
| Input height | `h-9` | 36px |
| Cell padding | `px-2 py-2` | 8px vertical |

**Card dimensions (from `src/app/globals.css`):**
```css
--size-product-card-mobile: 22.5rem;   /* 360px */
--size-product-card-tablet: 26rem;     /* 416px */
--size-product-card: 27.5rem;          /* 440px */
```

### Changes Required
1. **Price:** Change `text-lg` → `text-base` (18px → 16px)
2. **Title:** Change `text-sm` → `text-xs` (14px → 12px)
3. **Input height:** Change `h-9` → `h-8` (36px → 32px)
4. **Cell padding:** Change `py-2` → `py-1` (8px → 4px vertical)
5. Adjust flex layout to give image section more space

---

## Issue #6: Preorder Section Issues

### Problems
A. Only showing 3 sizes (should show all sizes from Shopify)
B. Showing negative available quantities (should not show negatives)
C. EMMI-PK showing wrong image
D. On Route calculation: Should be `PO quantity - Sold quantity`

### Research Findings

**A. Why only 3 sizes show:**
- **File:** `src/components/buyer/product-order-card.tsx` (Lines 76-78)
```typescript
function isVariantOrderable(variant: ProductVariant): boolean {
  return variant.available > 0 || variant.onRoute > 0;
}
```
- Filters out variants with zero/negative available AND zero onRoute
- **This is intentional** per current logic but may not match user expectation

**B. Negative quantities displayed:**
- **File:** `src/components/buyer/product-order-card.tsx` (Line 259)
```typescript
{variant.available}  // Displays raw value including negatives
```
- **Fix:** Should use `Math.max(0, variant.available)`

**C. Wrong image (EMMI-PK):**
- Same root cause as Issue #3 - image data from database may be stale

**D. On Route calculation:**
- Currently displays `onRoute` value directly from database
- User expects: `On Route = PO quantity - Sold quantity`
- Need to verify if this calculation happens at sync time or needs to be computed

### Changes Required
1. **Sizes:** Decide if ALL sizes should show (even with 0 inventory) or only orderable ones
2. **Negatives:** Add `Math.max(0, variant.available)` at line 259
3. **Images:** Fix data sync (same as Issue #3)
4. **On Route:** Verify calculation logic and where it should happen

---

## Issue #7: Click to Enlarge Product Images

### Problem
User wants ability to click on product images to enlarge, OR make images 20% larger

### Research Findings

**Current implementation:**
- **File:** `src/components/buyer/product-order-card.tsx` (Lines 18-52)
- **Component:** `ProductImage`
- Only has 5% hover scale effect (`group-hover:scale-105`)
- No click handler or modal functionality

**Available infrastructure:**
- Radix UI Dialog component exists (`src/components/ui/dialog.tsx`)
- Framer-motion available for animations
- Similar modal pattern used in `CategoryImageModal`

**Current image container:** Uses `flex-1` within card, fills remaining vertical space

### Changes Required

**Option A: Click to enlarge (Modal)**
1. Add click handler to `ProductImage` component
2. Create image modal/lightbox using existing Dialog component
3. Display full-size image in modal on click

**Option B: 20% larger images**
1. Increase `--size-product-card` CSS variables by 20%
2. Current: 440px desktop → New: 528px (~33rem)
3. May require grid layout adjustments

---

## Files Summary

| Issue | Primary Files to Modify |
|-------|------------------------|
| #1 SKU Prefixes | `src/lib/data/queries/shopify.ts`, display components |
| #2 Size Order | `src/lib/data/queries/skus.ts`, `preorder.ts` |
| #3 Titles/Images | `src/lib/shopify/sync.ts`, `src/lib/data/queries/*.ts` |
| #4 Blank PDF | `src/app/api/orders/[id]/pdf/route.ts`, `src/lib/pdf/generate.ts` |
| #5 Font/Spacing | `src/components/buyer/product-order-card.tsx`, `globals.css` |
| #6 Preorder | `src/components/buyer/product-order-card.tsx`, `src/lib/data/queries/preorder.ts` |
| #7 Image Enlarge | `src/components/buyer/product-order-card.tsx` |

---

## Priority Recommendation

1. **High:** #4 (Blank PDF) - Blocking functionality
2. **High:** #3 (Wrong titles/images) - Data accuracy
3. **High:** #6B (Negative quantities) - Quick fix
4. **Medium:** #2 (Size ordering) - UX improvement
5. **Medium:** #5 (Font/spacing) - UX improvement
6. **Medium:** #1 (SKU prefixes) - Display cleanup
7. **Low:** #7 (Image enlarge) - Enhancement
8. **Clarification needed:** #6A (All sizes vs orderable only)
