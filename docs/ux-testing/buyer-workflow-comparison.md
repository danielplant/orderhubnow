# Buyer/Customer UX Testing Report

**Date:** 2026-01-05
**Comparison:** inventory.limeapple.ca/USA (legacy .NET) vs www.orderhubnow.com (new Next.js)
**Focus:** Customer/Buyer role workflows

---

## Executive Summary

This report compares the buyer/customer experience between the legacy inventory.limeapple.ca/USA site and the new orderhubnow.com platform. The new site provides a modern, streamlined wholesale ordering experience with improved UX, but several features require attention for full parity and enhanced functionality.

### Key Findings

| Area | Status | Notes |
|------|--------|-------|
| Product Browsing | **Functional** | Modern card-based UI, improved visuals |
| Order Creation | **Functional** | Complete workflow with form validation |
| Draft Order Persistence | **Partial** | LocalStorage works, but no shareable links |
| Currency Switching | **Functional** | Real-time CAD/USD toggle |
| Customer Autocomplete | **Functional** | Store name search with auto-fill |
| Order Confirmation | **Functional** | PDF download available |
| Pre-Order Flow | **Functional** | Ship window display, no quantity caps |

---

## Feature Comparison Matrix

### 1. Authentication & Access

| Feature | Legacy (.NET) | New (Next.js) | Status |
|---------|--------------|---------------|--------|
| Customer login | Optional | None required | **Different Approach** |
| Anonymous ordering | Yes | Yes | **Parity** |
| Session persistence | Server-side | LocalStorage | **Different Approach** |
| Rep-initiated orders | Via session | Via URL params | **Parity** |

**Notes:** The new site uses a stateless approach where buyer session is entirely client-side via LocalStorage. This is simpler but means:
- No order history for returning customers
- No saved customer profiles (must re-enter or use autocomplete)
- Draft orders are device-specific (not synced across devices)

### 2. Product Browsing & Discovery

| Feature | Legacy (.NET) | New (Next.js) | Status |
|---------|--------------|---------------|--------|
| ATS collections | Yes | Yes | **Parity** |
| Pre-order collections | Yes | Yes | **Parity** |
| Category filtering | Yes | Yes | **Parity** |
| Product search | Yes | **No UI** | **Gap - Backend Ready** |
| Product images | Shopify sync | Shopify sync | **Parity** |
| Size grid display | Table-based | Modern grid | **Improved** |
| Stock indicators | Basic | Low stock + OnRoute | **Improved** |
| Currency toggle | Dropdown | Toggle button | **Improved** |

**Gaps Identified:**
1. **Product Search**: Backend query support exists but no search UI in buyer portal
   - Location: Could add to `BrandHeader` component
   - Priority: Medium - useful for large catalogs

### 3. Cart & Draft Order Management

| Feature | Legacy (.NET) | New (Next.js) | Status |
|---------|--------------|---------------|--------|
| Add to cart | Yes | Yes | **Parity** |
| Cart persistence | Session | LocalStorage | **Different** |
| Undo functionality | No | Yes | **Improved** |
| Clear cart | Yes | Yes | **Parity** |
| Cross-tab sync | No | Yes | **Improved** |
| **Copy draft link** | ? | **NOT IMPLEMENTED** | **Gap** |

**Critical Gap: Copy Link for Draft Order**

The user mentioned that the new site should have the ability to "copy a link for a draft order for the customer to revisit later." This feature is **NOT IMPLEMENTED** in the current codebase.

Current state:
- Draft orders stored in LocalStorage with key `draft-order`
- No mechanism to serialize cart state to URL
- No mechanism to restore cart from URL parameters

**Proposed Implementation:**

```typescript
// In order-context.tsx or new utility

// Serialize cart to base64 URL-safe string
function serializeDraftOrder(): string {
  const data = localStorage.getItem('draft-order');
  if (!data) return '';
  return btoa(encodeURIComponent(data));
}

// Generate shareable link
function generateDraftLink(): string {
  const serialized = serializeDraftOrder();
  return `${window.location.origin}/buyer/my-order?draft=${serialized}`;
}

// Restore cart from URL parameter
function restoreDraftFromUrl(draftParam: string): boolean {
  try {
    const data = decodeURIComponent(atob(draftParam));
    localStorage.setItem('draft-order', data);
    return true;
  } catch {
    return false;
  }
}
```

**UI Location:** Add "Copy Draft Link" button to:
1. `BrandHeader` (when cart has items)
2. `MyOrderClient` (order review page)

### 4. Order Form & Submission

| Feature | Legacy (.NET) | New (Next.js) | Status |
|---------|--------------|---------------|--------|
| Customer info form | Yes | Yes | **Parity** |
| Store name autocomplete | Yes | Yes | **Parity** |
| Auto-fill from customer | Yes | Yes | **Parity** |
| Rep auto-assignment | Yes | Yes | **Parity** |
| Billing address | Yes | Yes | **Parity** |
| Shipping address | Yes | Yes | **Parity** |
| Copy billing to shipping | Yes | Yes | **Parity** |
| Ship date selection | Yes | Yes | **Parity** |
| Order notes | Yes | Yes | **Parity** |
| Customer PO | Yes | Yes | **Parity** |
| Form validation | Server-side | Client + Server | **Improved** |

### 5. Order Confirmation

| Feature | Legacy (.NET) | New (Next.js) | Status |
|---------|--------------|---------------|--------|
| Success page | Yes | Yes | **Parity** |
| Order number display | Yes | Yes | **Parity** |
| Email confirmation | Yes | Yes | **Parity** |
| PDF download | Yes | Yes | **Parity** |
| Continue shopping | Yes | Yes | **Parity** |

### 6. Pre-Order Specific Features

| Feature | Legacy (.NET) | New (Next.js) | Status |
|---------|--------------|---------------|--------|
| Ship window display | Yes | Yes | **Parity** |
| Collection images | Yes | Gradient fallback | **Partial** |
| No quantity caps | Yes | Yes | **Parity** |
| OnRoute tracking | Yes | Yes | **Parity** |
| P-prefix order numbers | Yes | Yes | **Parity** |

---

## UX Improvements in New Site

### 1. Modern Visual Design
- Clean, card-based product display
- Smooth animations (Framer Motion)
- Responsive design for mobile/tablet/desktop
- Dark mode ready (uses CSS custom properties)

### 2. Better Feedback
- Real-time cart totals
- Visual announcements on quantity changes
- Loading states with spinners
- Toast notifications for actions

### 3. Accessibility
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus ring indicators
- Screen reader friendly

### 4. Performance
- Server-side rendering for initial load
- Client-side navigation
- Optimistic updates for cart
- Lazy image loading

---

## Critical Issues & Gaps

### High Priority

1. **Draft Order Link Sharing** (NOT IMPLEMENTED)
   - User-requested feature for sharing draft orders
   - Enables customers to save/share their in-progress orders
   - Implementation path clear (see above)

### Medium Priority

2. **Product Search UI**
   - Backend ready, needs UI component
   - Would improve UX for large catalogs

3. **Collection Images**
   - Currently uses gradient placeholders
   - Shopify images available for some categories
   - Need to populate category image URLs

### Low Priority

4. **Order History for Returning Customers**
   - Would require authentication layer
   - Current approach is valid for B2B workflow

5. **Wishlist/Saved Carts**
   - Would require authentication
   - Draft link sharing partially addresses this need

---

## Recommendations

### Immediate Actions

1. **Implement Draft Order Link Copy Feature**
   - Add `generateDraftLink()` utility to order-context
   - Add URL parameter parsing to restore drafts
   - Add "Copy Link" button to BrandHeader and MyOrderClient
   - Test cross-browser compatibility

2. **Add Product Search UI**
   - Add search input to BrandHeader
   - Connect to existing SKU query infrastructure
   - Add search results display

### Future Enhancements

3. **Category Images**
   - Admin interface to upload category images
   - Or auto-populate from first product in category

4. **Analytics Integration**
   - Track cart abandonment
   - Track search queries
   - Monitor conversion funnel

---

## Testing Checklist

### Core Buyer Workflows

- [ ] Browse ATS collections
- [ ] Browse Pre-order collections
- [ ] Add products to cart
- [ ] View cart summary
- [ ] Toggle currency (CAD/USD)
- [ ] Complete order form
- [ ] Submit order
- [ ] View confirmation
- [ ] Download PDF
- [ ] Continue shopping after order

### Edge Cases

- [ ] Empty cart redirect
- [ ] Large cart (50+ items)
- [ ] Multiple sizes same product
- [ ] Pre-order with ship windows
- [ ] Customer autocomplete selection
- [ ] Rep-initiated order flow
- [ ] Form validation errors
- [ ] Network error handling

### Missing Feature Tests (Once Implemented)

- [ ] Generate draft link
- [ ] Copy draft link to clipboard
- [ ] Open draft link in new browser
- [ ] Restore cart from draft link
- [ ] Invalid draft link handling

---

## Files Modified/Created

This report documents findings from analysis of:

**Buyer Pages:**
- `src/app/buyer/select-journey/page.tsx`
- `src/app/buyer/ats/page.tsx`
- `src/app/buyer/ats/[category]/page.tsx`
- `src/app/buyer/pre-order/page.tsx`
- `src/app/buyer/pre-order/[collection]/page.tsx`
- `src/app/buyer/my-order/page.tsx`
- `src/app/buyer/my-order/client.tsx`
- `src/app/buyer/confirmation/[id]/page.tsx`

**Buyer Components:**
- `src/components/buyer/brand-header.tsx`
- `src/components/buyer/product-order-card.tsx`
- `src/components/buyer/order-form.tsx`
- `src/components/buyer/collection-card.tsx`
- `src/components/buyer/journey-card.tsx`

**Core Contexts:**
- `src/lib/contexts/order-context.tsx`
- `src/lib/contexts/currency-context.tsx`

**Data Layer:**
- `src/lib/data/actions/orders.ts`
- `src/lib/data/queries/skus.ts`
- `src/lib/data/queries/preorder.ts`

---

## Conclusion

The new orderhubnow.com platform provides a solid foundation for wholesale ordering with modern UX improvements. The most critical gap is the **draft order link sharing feature** which was mentioned as a new capability but is not currently implemented. This should be prioritized for implementation to meet user expectations.

The overall buyer workflow is functional and represents an improvement over the legacy .NET system in terms of user experience, performance, and maintainability.
