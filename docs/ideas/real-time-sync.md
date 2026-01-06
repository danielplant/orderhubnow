# Real-Time Inventory Sync via Webhooks

**Status:** 🔵 Idea  
**Effort:** 2-4 hours  
**Priority:** Medium  
**Date Added:** 2026-01-06

## Current State

We do a **full batch sync every 4 hours**:
- Downloads all 8,148 variants from Shopify
- Truncates and replaces RawSkusFromShopify table
- Transforms to Sku table

This works but has up to 4-hour latency between Shopify inventory changes and SQL updates.

## What Best-in-Class Integrations Do

Top platforms (Faire, BigCommerce, Trunk, Stacksync) use a **hybrid approach**:

| Approach | Use Case | How |
|----------|----------|-----|
| Real-time webhooks | Inventory changes | Subscribe to `inventory_levels/update` |
| Periodic full sync | Reconciliation | Every 4-24 hours as safety net |

## Proposed Solution

### Subscribe to Shopify Webhooks

```
inventory_levels/update  → Triggered when stock changes
inventory_levels/connect → When new location added
products/update          → When product details change
```

### Benefits

| Aspect | Current (Batch) | With Webhooks (Hybrid) |
|--------|-----------------|------------------------|
| Latency | Up to 4 hours | Milliseconds |
| Data volume | 8,148 variants every run | Only changed items |
| API calls | Heavy (bulk operation) | Light (webhook push) |
| Oversell risk | Higher | Minimal |

## Implementation Steps

1. **Register webhooks with Shopify**
   - Add `inventory_levels/update` subscription
   - Use existing webhook registration utility in `src/lib/shopify/register-webhooks.ts`

2. **Create webhook endpoint**
   - `POST /api/webhooks/shopify/inventory-update`
   - Receives: `{ inventory_item_id, location_id, available }`

3. **Update single SKU**
   - Find variant by inventory_item_id
   - Update only that row in Sku table (not full refresh)

4. **Keep 4-hour full sync**
   - Acts as reconciliation/backup
   - Catches any missed webhooks

## References

- [Shopify Webhook Best Practices](https://shopify.dev/docs/apps/build/webhooks/best-practices)
- [inventory_levels/update webhook](https://shopify.dev/docs/api/admin-rest/2024-01/resources/webhook)

## When to Implement

Consider implementing when:
- ATS inventory moves fast and 4-hour delay causes overselling
- Need tighter integration with order management
- Customer complaints about stock accuracy
