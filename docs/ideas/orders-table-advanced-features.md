# Orders Table Advanced Features

**Status:** 🔵 Idea
**Effort:** 4-8 hours (varies by item)
**Priority:** Low
**Date Added:** 2026-01-22

## Context

During the Phase 1 & 2 orders table improvements (enhanced search, FilterPills, facets, Type/Season/Collection filters), several features were intentionally deferred due to complexity or architectural requirements.

## Completed Work (for reference)

- Enhanced search (OrderNumber, SalesRep, CustomerEmail)
- FilterPill components with static facet counts
- Type, Season, Collection filters
- Empty state component

## Deferred Features

### 1. SKU Search
**Effort:** 2-3 hours | **Risk:** Medium

**Problem:** Searching by SKU requires joining through `CustomerOrdersItems`, which causes duplicate order rows when an order has multiple matching items.

**Why Deferred:** Requires `DISTINCT` on the main query plus careful handling of pagination counts. The current search covers the most common use cases.

**Solution When Ready:**
```typescript
// Add to search conditions
if (input.q) {
  andConditions.push({
    OR: [
      { OrderNumber: { contains: input.q } },
      { StoreName: { contains: input.q } },
      // ... existing fields
      { CustomerOrdersItems: { some: { SKU: { contains: input.q } } } },
    ],
  })
}
// Must add DISTINCT and fix pagination count query
```

### 2. Amount Range Filter
**Effort:** 1-2 hours | **Risk:** Medium

**Problem:** Orders have amounts in different currencies (USD, CAD). Filtering by amount range is ambiguous without currency context.

**Why Deferred:** Need to decide UX: filter within single currency? Show currency selector? Convert to common currency?

**Options:**
- Filter only within selected currency
- Add currency toggle to filter
- Show separate filters per currency

### 3. Saved Views
**Effort:** 4-6 hours | **Risk:** High

**Problem:** Users want to save filter combinations (e.g., "My pending orders", "SS26 Pre-Orders").

**Why Deferred:** Creates state hierarchy complexity:
- Where to store views? (localStorage vs database)
- Per-user or shared?
- How to handle view + manual filter overrides?
- URL structure changes

**Polaris Pattern:** IndexFilters has tabs for saved views with mode switching.

### 4. Architecture Refactor
**Effort:** 3-4 hours | **Risk:** Medium

**Problem:** Current orders-table.tsx is 1000+ lines. Could extract:
- Filter state management hook
- URL sync logic
- Column definitions
- Bulk action handlers

**Why Deferred:** Working code. Refactor when adding significant new features, not proactively.

### 5. Select All Matching
**Effort:** 3-4 hours | **Risk:** High

**Problem:** "Select all 847 orders matching filters" for bulk operations across pages.

**Why Deferred:** Requires:
- Async job infrastructure (can't block request for 847 operations)
- Progress tracking UI
- Background worker or queue system

**Current State:** Selection is per-page only.

### 6. Row Preview Panel
**Effort:** 2-3 hours | **Risk:** Low

**Problem:** Quick preview of order details without full page navigation.

**Why Deferred:** New navigation model. Need to decide:
- Slide-over panel vs modal?
- Which fields to show?
- Edit capability or read-only?

## When to Implement

Consider implementing when:
- **SKU Search:** Users frequently search by SKU (currently can use Collection filter as workaround)
- **Amount Range:** Finance team needs amount-based filtering
- **Saved Views:** Power users managing multiple filter combinations daily
- **Architecture:** Adding 2+ new major features to orders table
- **Select All:** Bulk operations needed on 100+ orders regularly
- **Row Preview:** Users complaining about navigation friction

## References

- [Shopify Polaris IndexTable](https://polaris.shopify.com/components/tables/index-table)
- [Polaris IndexFilters](https://polaris.shopify.com/components/selection-and-input/index-filters)
- Original plan: `.claude/plans/dapper-finding-storm.md`
