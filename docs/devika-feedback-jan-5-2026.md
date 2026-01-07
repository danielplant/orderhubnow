# Devika Feedback - January 5, 2026

**From:** Limeapple - Debbie (Devika)  
**Date:** January 5, 2026 10:22 PM  
**Subject:** RE: OrderHubNow (OHN)

---

Hi Dan

So exciting. OHN looks great.

I have noticed the following that need to be adjusted when possible:

## Feedback Items

### 1. Remove DU3/DU2/DU9 SKU Prefix
We do not need the DU3, DU2, DU9 in front of the sku. This is something Bilal added to our sku when we had 2 warehouses in US and Canada to separate the inventory. The logic is still there, and the system is still adding these which we do not want.

**Status:** ✅ FIXED - New Shopify sync produces clean SKUs

---

### 2. Size Ordering (Small to Big)
Ref to the ordering screen product view - can we organize the sizes from small to big. Is this something you can allow us to do or can this be setup similar to the sizes listed below.

**Expected order:**
- XXS, XS, S, M, L, XL, XXL
- 0/6M, 6/12M, 12/18M, 18/24M, 2T, 2/3, 3T, 4, 4/5, 5, 6, 6/6X, 7, 7/8, 8, 10, 10/12, 12, 14, 14/16, 16
- 5/6, 7/8, 10/12, 14/16, S, M, L

**Status:** ✅ IMPLEMENTED - `sortBySize()` in `src/lib/utils/size-sort.ts`

---

### 3. Wrong Product Titles and Images (Cozy Section)
Noticed some of the product titles and images are incorrect in the Cozy section of the ATS. I think Bilal had some issues if an item had multiple colorways and one listing in shopify. Not sure if the issues are related.

**Examples:**
- First item the product title should be "cuddle bubble hoodie". Are we reading the metafield Label title from Shopify?
- Second item the image should be the black cuddle bubble hoodie.

**Question:** Is it possible to get all the product information for ATS and Preorder from Shopify instead of reading the old system?

**Status:** 🔵 NEEDS INVESTIGATION - See `docs/ideas/wrong-titles-images.md`

---

### 4. PDF Download Showing Blank
When I try to download a PDF the orders it does not show the info. I see a blank document (A8108-Confirmation.pdf attached).

**Status:** 🔵 NEEDS INVESTIGATION - See `docs/ideas/pdf-blank-issue.md`

---

### 5. UI Polish - Font Size and Spacing
- Can we have the price and the product title (e.g. "2 PC PREPACK PUPPY LOVE LOUNGE SHORT") font a little smaller, so the title may fit in one line instead of wrapping around.
- Can we also reduce the height of the Order quantity section/line to be close to the other 3 lines so we can give a little more space for the product image.

**Status:** 🔵 UI POLISH - Low priority

---

### 6. PreOrder Section Issues
Ref to the preorder section:
- I only see 3 sizes for the items. We need to show all sizes that is in shopify for an item. (All sizes offered are added to shopify)
- We do not need to show available quantities that are negative for Preorder. (We calculate onroute from shopify data: On Route = PO quantity - Sold quantity)
- I also noticed EMMI-PK showing the wrong image

**Status:** 🔵 NEEDS INVESTIGATION - See `docs/ideas/preorder-missing-sizes.md`

---

### 7. Click to Enlarge Product Images
Is it possible to click on the product image to enlarge or give a slightly bigger (20% more) image for the products.

**Status:** ✅ IMPLEMENTED - Lightbox modal in `product-order-card.tsx`

---

I will do more testing tomorrow.

Thank you  
Devika

---

## Summary

| Item | Status |
|------|--------|
| 1. Remove DU3/DU9 prefix | ✅ Fixed |
| 2. Size ordering | ✅ Implemented |
| 3. Wrong titles/images | 🔵 Investigate |
| 4. PDF blank | 🔵 Investigate |
| 5. UI polish (fonts/spacing) | 🔵 Low priority |
| 6. PreOrder sizes | 🔵 Investigate |
| 7. Click to enlarge | ✅ Implemented |
