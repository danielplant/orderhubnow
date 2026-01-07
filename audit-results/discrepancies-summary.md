# ATS Title/Image Discrepancy Audit Report

**Date:** January 7, 2026
**Scope:** All ATS (non-PreOrder) categories
**Focus Area:** Cozy (Category ID 157)

---

## Executive Summary

The audit identified **488 total discrepancy instances** across the ATS catalog:

| Issue Type | Count | Impact |
|------------|-------|--------|
| **Missing OrderEntryDescription** | 364 SKUs | Title falls back to Shopify Description |
| **Transform mismatches** | 101 SKUs | Image URL differs between Raw and Sku tables |
| **BaseSku groups with inconsistent images** | 18 groups | Card displays wrong colorway |
| **Shared product images** | 5 images | Multiple colorways show same image |

---

## Root Cause Analysis

### 1. **Inconsistent Images Within BaseSku Groups** (Critical)

**Problem:** Some baseSku groups have different images for different sizes because they actually represent **multiple Shopify products** (e.g., Kids vs Ladies versions) that share the same SKU prefix.

**Cozy Category Examples:**
- `600C-BLK` - Kids sizes (10/12, 14/16) have image `600c-bk-2.webp`, Ladies sizes (S, M, L) have `600c-blk-3.jpg`
- `600C-VPTD` - Kids sizes have `600c-vptd-2.webp`, Ladies sizes have `600c-vptd-3.webp`

**Impact:** The UI uses "first-row-wins" logic (`skus.ts:59`), so whichever variant comes first in the database query determines the card's displayed image. This causes:
- Black hoodie card potentially showing a different colorway's image
- Tie-dye hoodie card showing wrong variant image

**All Affected BaseSku Groups (18 total):**

| Category | BaseSku | Sizes | Distinct Images |
|----------|---------|-------|-----------------|
| 157 (Cozy) | 600C-BLK | 7 | 2 |
| 157 (Cozy) | 600C-VPTD | 11 | 2 |
| 358 (Last Call) | 582P-CC | 6 | 2 |
| 358 (Last Call) | 582P-KS | 6 | 2 |
| 358 (Last Call) | ADDISON-MN | 6 | 2 |
| 358 (Last Call) | ALEXA-MU | 2 | 2 |
| 358 (Last Call) | EMILIA-MU | 9 | 2 |
| 358 (Last Call) | FIORELLA-FC | 2 | 2 |
| 358 (Last Call) | GEORGIA-BU | 8 | 2 |
| 358 (Last Call) | LILIANNA-BU | 7 | 2 |
| 358 (Last Call) | MADELIENE-BK | 8 | 2 |
| 358 (Last Call) | MARINA-MG | 8 | 2 |
| 410 (Preppy Goose) | 582P-FD | 6 | 2 |
| 410 (Preppy Goose) | 584P-FD | 6 | 2 |
| 410 (Preppy Goose) | 611P-JY | 6 | 2 |
| 410 (Preppy Goose) | EMERY-CM | 6 | 2 |
| 423 (Holiday Preppy Goose) | 582P-CC | 6 | 2 |
| 423 (Holiday Preppy Goose) | 611P-JY | 6 | 2 |

### 2. **Missing OrderEntryDescription** (High)

**Problem:** 364 SKUs have `OrderEntryDescription` = NULL, causing the UI to fall back to `Description` (Shopify product title + variant info).

**Example:**
- SKU `139E-MU-10` shows "Pastel Activewear Bike Shorts - 10 / Multi..." instead of the clean label title

**Categories with Missing OED:**
- Active (187): 11 SKUs
- Swim (330): 80+ SKUs
- Various PreOrder categories

**Root Cause:** The Shopify `custom.label_title` metafield is not populated for these products.

### 3. **Transform Mismatches** (Medium)

**Problem:** 101 SKUs have different image URLs between `RawSkusFromShopify.ShopifyProductImageURL` and `Sku.ShopifyImageURL`.

**Top Affected SKUs:**
- `600C-FC-*` (4 sizes)
- `600C-SC-*` (4 sizes)
- `143S-*` (12 sizes across 4 colors)

**Root Cause:** The transform process may be picking different images or the sync runs are inconsistent.

### 4. **Shared Product Images** (Low)

**Problem:** 5 image URLs are used across 3+ different baseSku groups, suggesting these may be product-level fallback images rather than variant-specific images.

**Example:**
- `megan-crinkle-textured-one-piece-swimsuit.jpg` used by 4 different baseSkus (21 total rows)
- `vasia-crinkle-skirt.jpg` used by 4 different baseSkus (20 total rows)

---

## Recommendations

### Immediate Fixes

1. **Fix "First Row Wins" Logic** (`src/lib/data/queries/skus.ts`)
   - Instead of picking the first row, prefer rows that have:
     - Non-null `ShopifyImageURL`
     - Matching colorway in image filename

2. **Separate Kids vs Ladies Products**
   - Consider using distinct baseSku values for Kids vs Ladies (e.g., `600C-BLK-K` vs `600C-BLK-L`)
   - Or add logic to split mixed product cards

### Data Quality Improvements

3. **Populate Missing label_title in Shopify**
   - Export list of 364 SKUs missing `OrderEntryDescription`
   - Update `custom.label_title` metafield in Shopify Admin

4. **Ensure Variant-Specific Images**
   - Audit products where variant image = product featured image
   - Upload unique images for each colorway variant in Shopify

### Process Improvements

5. **Add Data Quality Checks to Sync**
   - Alert when baseSku group has inconsistent images
   - Alert when OED is null but Description exists

---

## Files Generated

- `phase1a-inconsistent-groups-*.json` - 18 baseSku groups with image/OED inconsistencies
- `phase1b-missing-oed-*.json` - 364 SKUs missing OrderEntryDescription
- `phase1c-shared-images-*.json` - 5 images shared across 3+ baseSkus
- `phase2-transform-mismatches-*.json` - 101 SKUs with Raw vs Sku differences
- `phase2-full-comparison-*.json` - Full 3567 SKU comparison
- `audit-summary-*.csv` - Combined CSV for merch/ops review
- `cozy-ats-audit-full.png` - Screenshot of Cozy ATS page

---

## Data Sources

- **Sku table**: Final transformed data displayed in UI
- **RawSkusFromShopify table**: Raw data from Shopify bulk sync
- **UI Scrape**: Playwright snapshot of live ATS pages
