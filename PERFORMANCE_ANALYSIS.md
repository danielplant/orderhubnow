# Performance Analysis Report

This document outlines performance anti-patterns, N+1 queries, unnecessary re-renders, and inefficient algorithms found in the codebase.

## Executive Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| N+1 Queries | 2 | 2 | 1 | - |
| React Re-renders | 2 | 2 | 4 | 2 |
| Inefficient Algorithms | 1 | 1 | 2 | 5 |
| Database/Prisma Issues | 4 | 4 | 3 | - |

---

## 1. N+1 Query Anti-Patterns

### CRITICAL

#### 1.1 Customer Import from Shopify
**File:** `src/app/api/customers/import-shopify/route.ts:155-198`

**Problem:** Database query inside loop - one `findFirst()` per customer, then either `update()` or `create()`.

```typescript
for (const shopifyCustomer of customers) {
  const existing = await prisma.customers.findFirst({  // N+1: Query per iteration
    where: { Email: shopifyCustomer.email },
    select: { ID: true },
  })

  if (existing) {
    await prisma.customers.update({ ... })
  } else {
    await prisma.customers.create({ ... })
  }
}
```

**Impact:** With 250+ customers per page and multiple pages, this creates 500+ unnecessary database queries.

**Fix:** Batch with `findMany({ Email: { in: allEmails } })` and use `upsert` or `createMany`/`updateMany`.

---

#### 1.2 Products Upload
**File:** `src/app/api/products/upload/route.ts:151-206`

**Problem:** Database query inside loop - one `findFirst()` per SKU row.

```typescript
for (let i = 0; i < rows.length; i++) {
  const existing = await prisma.sku.findFirst({  // N+1: Query per row
    where: { SkuID: row.skuId },
  })
  // ... update or create
}
```

**Impact:** Excel imports with 100+ rows trigger 200+ queries.

**Fix:** Fetch all SKUs upfront with `findMany({ SkuID: { in: allSkuIds } })`, then use batch operations.

---

### HIGH

#### 1.3 Shipment Processing - Nested N+1
**File:** `src/lib/data/actions/shipments.ts:741-798`

**Problem:** Nested `Promise.all()` with database queries - calls `findShopifyVariant()` for every shipment item.

```typescript
const shipmentsWithShopifySku = await Promise.all(
  shipments.map(async (s) => {
    const itemsWithShopifySku = await Promise.all(
      s.ShipmentItems.map(async (si) => {
        const shopifyVariant = await findShopifyVariant(...)  // N+1
      })
    )
  })
)
```

**Impact:** 10 shipments with 5 items each = 50 separate variant lookups.

**Fix:** Batch all SKU variant lookups upfront before mapping.

---

#### 1.4 Order Items with Fulfillment
**File:** `src/lib/data/actions/shipments.ts:941-982`

**Problem:** Same pattern - `findShopifyVariant()` called for each order item individually.

**Fix:** Collect all unique SKU IDs first, batch query, then map results.

---

### MEDIUM

#### 1.5 Duplicate Rep Lookups
**File:** `src/lib/data/actions/shipments.ts:375-379, 420-427, 1581-1586`

**Problem:** Same rep queried 2-3 times within a single function.

**Fix:** Cache rep lookup result or fetch once and reuse.

---

## 2. React Re-render Issues

### CRITICAL

#### 2.1 Large OrderContext Value
**File:** `src/lib/contexts/order-context.tsx:70-117`

**Problem:** Massive context value with 25+ properties. Every state change triggers re-renders of ALL consumers.

```typescript
<OrderContext.Provider
  value={{
    orders,
    totalItems,
    totalPrice,
    addItem,
    removeItem,
    // ... 20+ more properties - recreated every render
  }}
>
```

**Impact:** Entire cart UI re-renders on any state change. Components needing only `totalItems` re-render when `orders` changes.

**Fix:** Split into multiple contexts:
- `CartStateContext` (orders, totalItems, totalPrice)
- `CartActionsContext` (addItem, removeItem, setQuantity)
- `DraftStateContext` (draft-related state)

---

#### 2.2 Form Field Watching
**File:** `src/components/buyer/order-form.tsx:232-277`

**Problem:** `watch()` on entire form causes re-renders on ANY field change.

```typescript
const allFormValues = watch()  // Watches ALL 20+ fields
useEffect(() => {
  // Debounced sync triggered frequently
}, [allFormValues, ...])
```

**Impact:** High frequency re-renders during form input.

**Fix:** Use `useWatch` for specific fields instead of watching all fields.

---

### HIGH

#### 2.3 Inline Objects in JSX Props
**File:** `src/components/buyer/product-order-card.tsx:345-352`
**File:** `src/components/admin/report-toolbar.tsx:61-68`

**Problem:** Inline object creation breaks memoization.

```typescript
// report-toolbar.tsx
const currentState = {
  columns: visibleColumns,
  columnOrder,
  filters,
  // ... new object every render
};
```

**Fix:** Wrap in `useMemo()`.

---

#### 2.4 Missing useCallback for Handlers
**File:** `src/components/buyer/collection-filter-bar.tsx:104-135`

**Problem:** Arrow functions created inline for filter changes.

```typescript
<FilterPill
  onChange={(v) => setFilters(prev => ({ ...prev, category: v }))}  // New function every render
/>
```

**Fix:** Use `useCallback` for handler functions.

---

### MEDIUM

#### 2.5 Missing useMemo for Expensive Computations
**File:** `src/components/buyer/product-order-card.tsx:145-147`

```typescript
const orderableVariants = isPreOrder
  ? product.variants
  : product.variants.filter(isVariantOrderable);  // Runs every render
```

**Fix:** `useMemo(() => ..., [isPreOrder, product.variants])`

---

#### 2.6 Missing React.memo for Table Components
**File:** `src/components/ui/data-table.tsx:209-265`

**Problem:** Column and row components not memoized in loops.

**Impact:** Large tables (50+ rows, 10+ columns) have expensive re-renders.

**Fix:** Extract row/cell components and wrap with `React.memo`.

---

## 3. Inefficient Algorithms

### HIGH

#### 3.1 Nested Loops in Order Category Building
**File:** `src/lib/data/queries/orders.ts:439-495`

**Problem:** 5 separate loops building intermediate maps from same data.

```typescript
// Loop 1: extract unique SKUs
// Loop 2: build skuToCategory map
// Loop 3: loop items to group by order
// Loop 4: loop again for categories
// Loop 5: convert to strings
```

**Fix:** Combine loops and build result in single pass where possible.

---

#### 3.2 Array Lookups Instead of Map/Set
**File:** `src/lib/utils/size-sort.ts:57, 133-134`

**Problem:** `SIZE_ORDER.some()` and `SIZE_ORDER.findIndex()` are O(n) lookups called for every comparison.

```typescript
function isKnownSize(s: string): boolean {
  return SIZE_ORDER.some(size => size.toUpperCase() === normalized);  // O(n)
}
```

**Fix:** Create a `Set<string>` at module level for O(1) lookups:
```typescript
const SIZE_ORDER_SET = new Set(SIZE_ORDER.map(s => s.toUpperCase()));
```

---

### MEDIUM

#### 3.3 Sequential .find() Calls
**File:** `src/lib/utils/rep-matching.ts:34-55`

**Problem:** Three separate `.find()` loops with redundant scanning.

**Fix:** Single loop with priority logic.

---

#### 3.4 Filter Then Reduce Pattern
**File:** `src/lib/data/actions/shipments.ts:332-334`

```typescript
const previouslyShipped = allShipments
  .filter((s) => s.ID < result.ID)
  .reduce((sum, s) => sum + (s.ShippedTotal || 0), 0)  // Two passes
```

**Fix:** Single `reduce()` with conditional:
```typescript
allShipments.reduce((sum, s) => s.ID < result.ID ? sum + (s.ShippedTotal || 0) : sum, 0)
```

---

## 4. Database/Prisma Issues

### CRITICAL - Missing Indexes

**File:** `prisma/schema.prisma`

| Model | Field | Line | Usage |
|-------|-------|------|-------|
| Customers | Email | 112 | Customer lookup, Shopify sync |
| Customers | Phone | 112 | Customer search |
| Customers | Rep | 118 | Heavily filtered |
| Customers | StoreName | 114 | Search operations |
| Sku | SkuID | 371 | Primary search field |
| RawSkusFromShopify | ShopifyId | 280 | Shopify sync queries |
| CustomersFromShopify | Email | 145 | Customer lookup |

**Fix:** Add indexes to schema:
```prisma
model Customers {
  // ...
  @@index([Email])
  @@index([Rep])
  @@index([StoreName])
}

model Sku {
  // ...
  @@index([SkuID])
}
```

---

### HIGH - Unbounded Queries

#### 4.1 Open Items Query
**File:** `src/lib/data/queries/open-items.ts:74-100`

**Problem:** `findMany()` without `take/skip` loads ALL order items into memory, then applies client-side pagination.

**Impact:** OOM on large datasets (>10k order items).

**Fix:** Implement database-level pagination with `take`/`skip`.

---

#### 4.2 Dashboard SKU Aggregation
**File:** `src/lib/data/queries/dashboard.ts:79-91`

**Problem:** Queries all SKUs with `Quantity > 0`, then aggregates in JavaScript.

```typescript
const skus = await prisma.sku.findMany({
  where: { Quantity: { gt: 0 }, ... }
})
return skus.reduce(...)  // Aggregation should be in DB
```

**Fix:** Use Prisma `aggregate()` or raw SQL for sum calculations.

---

#### 4.3 Hot SKUs Report - Scalar Subqueries
**File:** `src/lib/data/queries/reports.ts:240-265`

**Problem:** Scalar subqueries repeated inside SELECT clause.

```sql
SELECT s.SkuID,
  COALESCE((SELECT SUM(coi.Quantity) ... WHERE coi.SKU = s.SkuID), 0) AS SoldLast30,
  CASE ... / (SELECT SUM(coi.Quantity) ... ) ...  -- SAME SUBQUERY REPEATED
```

**Impact:** Subquery executed multiple times per row.

**Fix:** Use CTE or join to calculate sums once.

---

### MEDIUM - Missing SELECT Statements

#### 4.4 Customers Query Over-fetching
**File:** `src/lib/data/queries/customers.ts:47-52`

**Problem:** `findMany` without `select` fetches ALL columns including large `AdditionalInfo` NVarChar(Max).

**Fix:** Add explicit `select` with only required fields.

---

### MEDIUM - Transaction Issues

#### 4.5 Shipment Update Outside Transaction
**File:** `src/lib/data/actions/shipments.ts:270-408`

**Problem:** Shopify fulfillment ID update happens AFTER transaction completes.

```typescript
const result = await prisma.$transaction(async (tx) => {
  // ... create shipment
  return shipment
})

// OUTSIDE TRANSACTION - race condition risk
await prisma.shipments.update({
  where: { ID: result.ID },
  data: { ShopifyFulfillmentID: shopifyFulfillmentId }
})
```

**Fix:** Include Shopify sync in transaction or handle partial failure gracefully.

---

## Priority Recommendations

### Immediate (Critical Impact)

1. **Add database indexes** on `Customers.Email`, `Sku.SkuID`, `Customers.Rep`
2. **Fix N+1 in customer/product imports** - batch queries with `findMany` + `in` clause
3. **Split OrderContext** into separate contexts for state and actions
4. **Paginate open-items query** at database level

### Short-term (High Impact)

5. **Batch Shopify variant lookups** in shipment processing
6. **Use database aggregation** instead of client-side for dashboard metrics
7. **Add `select` statements** to frequently used queries
8. **Fix Hot SKUs report** subquery repetition

### Medium-term (Optimization)

9. **Add React.memo** to data table row components
10. **Use useCallback/useMemo** for inline handlers and computed values
11. **Consolidate rep lookups** in shipment actions
12. **Optimize size-sort** with Set instead of Array lookups

---

## Metrics to Monitor

After implementing fixes, track:
- Database query count per request (should decrease significantly)
- React component render count (use React DevTools Profiler)
- API endpoint response times
- Memory usage during bulk operations (imports)
- Bundle size (ensure no regressions)
