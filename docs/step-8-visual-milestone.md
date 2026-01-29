# Step 8: Visual Milestone - Verification Plan

## Overview

Step 8 is not a coding step. It is a **verification checkpoint** to confirm that Steps 5-7 work together correctly and the graph renders real data on screen.

**Goal**: Confirm the schema graph renders correctly before proceeding to configuration features (Steps 9-11).

---

## 8.1 Prerequisites

| Step | Requirement | How to Verify |
|------|-------------|---------------|
| Step 3 | `ShopifyFieldMapping` table exists | `npx prisma db push` or check migrations |
| Step 4 | `buildSchemaGraph()` function works | Already implemented |
| Step 5 | API endpoint returns data | `curl /api/admin/shopify/schema` |
| Step 6 | Page fetches and renders | Navigate to `/admin/dev/shopify/schema` |
| Step 7 | Custom nodes render | Entity nodes blue, field nodes colored |

**Critical prerequisite**: Schema cache must be populated. If not:
1. Navigate to `/admin/dev/shopify/config`
2. Select each entity type (Product, ProductVariant, etc.)
3. Click "Refresh Schema" for each

---

## 8.2 Verification Environment

### 8.2.1 Start Development Server

```bash
cd /Users/danielplant/orderhubnow/ohn
npm run dev
```

### 8.2.2 Verify No Build Errors

Check terminal output for:
- ✅ "Ready in X.Xs"
- ❌ Red error text
- ❌ TypeScript errors

### 8.2.3 Open Browser

```
http://localhost:3000/admin/dev/shopify/schema
```

Must be logged in as admin.

---

## 8.3 Visual Verification Checklist

### 8.3.1 Page Load

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Page loads without error | No error screen | ☐ |
| Loading spinner appears | Spinner visible briefly | ☐ |
| Graph container renders | White bordered area visible | ☐ |
| Stats header shows | "X entities · Y fields" | ☐ |
| Refresh button visible | Top-right of stats bar | ☐ |

### 8.3.2 Entity Nodes

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Entity nodes visible | Blue gradient header nodes | ☐ |
| All 6 entities present | Product, ProductVariant, Collection, Order, Customer, InventoryItem | ☐ |
| Entity names displayed | "Product", "Product Variant", etc. | ☐ |
| Field count badge | Number in badge (e.g., "42") | ☐ |
| Expand chevron visible | ">" icon on right | ☐ |
| Click expands entity | Fields appear below | ☐ |
| Click collapses entity | Fields disappear | ☐ |
| Database icon visible | Icon left of entity name | ☐ |

### 8.3.3 Field Nodes (when entity expanded)

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Field nodes appear | Smaller colored nodes | ☐ |
| Category colors applied | Different border colors per category | ☐ |
| Field names show | ".title", ".sku", ".price", etc. | ☐ |
| Type badge visible | "String", "Money", "Boolean", etc. | ☐ |
| Status icons show | Check/Circle/Lock/Eye icons | ☐ |
| Protected fields have lock | 🔒 icon visible | ☐ |
| Relationship fields have link | 🔗 icon visible | ☐ |
| Object fields have chevron | → icon visible | ☐ |

### 8.3.4 Edges (Connections)

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Entity→Field edges | Lines connecting entity to its fields | ☐ |
| Edges render smoothly | No jagged/broken lines | ☐ |
| Edges connect to handles | Lines attach at node edges, not centers | ☐ |

### 8.3.5 Graph Controls

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Controls panel visible | Bottom-left corner | ☐ |
| Zoom in works | Click + or scroll up | ☐ |
| Zoom out works | Click - or scroll down | ☐ |
| Fit view works | Click fit-to-screen button | ☐ |
| Pan works | Click and drag background | ☐ |

### 8.3.6 MiniMap

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| MiniMap visible | Bottom-right corner | ☐ |
| Entity nodes blue | Blue dots in minimap | ☐ |
| Field nodes gray/colored | Smaller dots | ☐ |
| Viewport indicator | Rectangle showing current view | ☐ |
| Click minimap navigates | Clicking moves main view | ☐ |

### 8.3.7 Stats Display

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Entity count accurate | Matches number of entity nodes | ☐ |
| Field count accurate | Total fields across all entities | ☐ |
| Visible/total nodes | Shows "X / Y nodes visible" | ☐ |
| Expanded count | Shows "X expanded" | ☐ |
| Duration shows | "(Xms)" timing | ☐ |

---

## 8.4 Functional Verification

### 8.4.1 Expand/Collapse Flow

```
1. Page loads with all entities collapsed
2. Click "Product" entity
   → Product's fields appear
   → Chevron rotates to indicate expanded
   → "1 expanded" in stats
3. Click "ProductVariant" entity
   → ProductVariant's fields appear
   → "2 expanded" in stats
4. Click "Product" again
   → Product's fields disappear
   → "1 expanded" in stats
5. Verify edges update correctly
   → Only edges for visible nodes shown
```

| Step | Pass/Fail |
|------|-----------|
| Initial collapsed state | ☐ |
| First entity expands | ☐ |
| Second entity expands | ☐ |
| First entity collapses | ☐ |
| Edges update correctly | ☐ |

### 8.4.2 Refresh Flow

```
1. Click "Refresh" button
2. Button shows spinner
3. Graph updates (may flash)
4. Stats update with new timing
5. Expansion state preserved
```

| Step | Pass/Fail |
|------|-----------|
| Refresh button works | ☐ |
| Spinner shows during refresh | ☐ |
| Data reloads | ☐ |
| Expansion state preserved | ☐ |

---

## 8.5 Category Color Verification

Expand entities and verify field nodes have correct category colors:

| Category | Expected Border Color | Example Fields |
|----------|----------------------|----------------|
| system | Slate-400 | id, legacyResourceId |
| timestamp | Cyan-400 | createdAt, updatedAt |
| scalar | Slate-300 | title, description, vendor |
| enum | Green-400 | status, productType |
| object | Amber-400 | seo, priceRange, compareAtPriceRange |
| connection | Indigo-400 | variants, collections, media |
| count | Teal-400 | variantsCount, mediaCount |
| relationship | Purple-400 | product (on ProductVariant) |

| Category Verified | Pass/Fail |
|-------------------|-----------|
| system fields styled | ☐ |
| timestamp fields styled | ☐ |
| scalar fields styled | ☐ |
| enum fields styled | ☐ |
| object fields styled | ☐ |
| connection fields styled | ☐ |
| relationship fields styled | ☐ |

---

## 8.6 Console Verification

Open browser DevTools (F12) → Console tab.

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| No React errors | No red error messages | ☐ |
| No React Flow warnings | No "unknown node type" warnings | ☐ |
| No 404 errors | No failed API requests | ☐ |
| No TypeScript runtime errors | No type-related crashes | ☐ |

**Acceptable warnings**:
- ESLint warnings (yellow)
- React StrictMode double-render warnings
- Next.js hot-reload messages

**Not acceptable**:
- "Unknown node type: entity"
- "Unknown node type: field"
- "Cannot read property of undefined"
- Any red error text

---

## 8.7 Network Verification

Open browser DevTools → Network tab.

### 8.7.1 Initial Load

| Request | Expected | Pass/Fail |
|---------|----------|-----------|
| `GET /api/admin/shopify/schema` | 200 OK | ☐ |
| Response has `success: true` | In response body | ☐ |
| Response has `nodes` array | Non-empty array | ☐ |
| Response has `edges` array | Array (may be empty initially) | ☐ |
| Response has `_meta.durationMs` | Number | ☐ |

### 8.7.2 Response Size

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Response size reasonable | < 500KB | ☐ |
| Response time reasonable | < 2 seconds | ☐ |

### 8.7.3 Refresh Request

| Request | Expected | Pass/Fail |
|---------|----------|-----------|
| Click refresh triggers request | New `GET /api/admin/shopify/schema` | ☐ |
| Response successful | 200 OK | ☐ |

---

## 8.8 Edge Cases

### 8.8.1 Empty Cache

If schema cache is empty:

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| API returns 404 | With `code: 'CACHE_EMPTY'` | ☐ |
| Page shows empty state | Amber warning icon | ☐ |
| Hint message displayed | Instructions to populate cache | ☐ |
| "Go to Config Page" button | Links to `/admin/dev/shopify/config` | ☐ |

### 8.8.2 API Error

Simulate by stopping the database or modifying the API:

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Error state displays | Red warning icon | ☐ |
| Error message shown | Describes the error | ☐ |
| Retry button works | Attempts to reload | ☐ |

### 8.8.3 Large Graph

With all entities expanded:

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| Graph remains responsive | No lag when panning | ☐ |
| Zoom works smoothly | No stuttering | ☐ |
| MiniMap updates | Shows all nodes | ☐ |

---

## 8.9 Screenshot Verification

Take screenshots for documentation:

1. **Initial state** - All entities collapsed
2. **One entity expanded** - Product with fields visible
3. **Multiple entities expanded** - Product + ProductVariant
4. **Zoomed out** - Full graph overview
5. **MiniMap close-up** - Showing node colors
6. **Empty state** - When cache is empty
7. **Error state** - When API fails

---

## 8.10 Performance Baseline

Record these metrics for future comparison:

| Metric | Value |
|--------|-------|
| API response time (`_meta.durationMs`) | _____ ms |
| Total nodes count | _____ |
| Total edges count | _____ |
| Time to first render | _____ ms |
| Memory usage (DevTools → Performance) | _____ MB |

---

## 8.11 Known Issues to Document

Document any issues found but not blocking:

| Issue | Severity | Notes |
|-------|----------|-------|
| | | |
| | | |
| | | |

---

## 8.12 Sign-Off Checklist

### Must Pass (Blocking)

- [ ] Page loads without errors
- [ ] Entity nodes render with blue styling
- [ ] Field nodes render with category colors
- [ ] Expand/collapse works
- [ ] Stats display correctly
- [ ] No console errors related to React Flow
- [ ] API returns valid data

### Should Pass (Non-Blocking)

- [ ] All 6 entities present
- [ ] All status icons render correctly
- [ ] MiniMap shows correct colors
- [ ] Performance is acceptable (< 2s load)
- [ ] Edges connect properly

### Nice to Have

- [ ] Smooth animations
- [ ] Responsive at different viewport sizes
- [ ] Keyboard navigation works

---

## 8.13 Milestone Outcome

**Status**: ☐ PASS / ☐ FAIL

**Date verified**: _______________

**Verified by**: _______________

**Notes**:
```
[Add any observations, screenshots, or issues here]
```

---

## 8.14 Next Steps

If **PASS**:
- Proceed to Step 9: FieldConfigModal implementation
- The graph foundation is solid

If **FAIL**:
- Document specific failures
- Address blocking issues before proceeding
- Re-run verification after fixes

---

## 8.15 Quick Verification Commands

```bash
# 1. Check TypeScript compiles
npm run type-check

# 2. Start dev server
npm run dev

# 3. Test API directly
curl -s http://localhost:3000/api/admin/shopify/schema | jq '.success, .entityCount, .fieldCount'

# 4. Open in browser
open http://localhost:3000/admin/dev/shopify/schema
```
