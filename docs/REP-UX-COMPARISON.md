# Sales Rep UX Comparison: inventory.limeapple.ca vs orderhubnow.com

**Date:** January 5, 2026
**Branch:** `claude/test-rep-ux-comparison-aV8Qu`

---

## Executive Summary

This document compares the Sales Rep (rep) role experience between the legacy .NET system (inventory.limeapple.ca/USA) and the new Next.js platform (orderhubnow.com). Based on codebase analysis, architecture documentation, and .NET parity comments throughout the code, this report identifies feature parity, UX improvements, and recommendations for ensuring the new platform delivers a high-performance, robust, simple, and enjoyable experience.

---

## 1. Feature Comparison Matrix

| Feature | Old Site (.NET) | New Site (Next.js) | Status |
|---------|-----------------|-------------------|--------|
| **Authentication** |
| Rep Login | RepLogin.aspx | `/rep/login` | ✅ Implemented |
| Session Management | ASP.NET Forms Auth | NextAuth.js | ✅ Improved |
| **Orders Management** |
| View My Orders | RepOrders.aspx | `/rep/orders` | ✅ Implemented |
| Filter by Status | Yes | Yes (Pending, Processing, Shipped, Invoiced, Cancelled) | ✅ Parity |
| Search by Store | Yes | Yes | ✅ Parity |
| Sort Orders | Yes | Yes (manual sorting with URL params) | ✅ Parity |
| Pagination | Yes | Yes (server-side, configurable page size) | ✅ Parity |
| Export to Excel | Yes | Yes (`/api/rep/orders/export`) | ✅ Parity |
| Edit Pending Orders | Yes | Yes (if not in Shopify) | ✅ Parity |
| View Order PDF | Yes | Yes (`/api/orders/{id}/pdf`) | ✅ Parity |
| **Order Creation** |
| Create New Order | MyOrder.aspx | Buyer flow with rep context | ✅ Implemented |
| ATS (Available to Ship) | SkusCategories.aspx | `/buyer/ats` | ✅ Parity |
| Pre-Order (Future Seasons) | PreOrder.aspx | `/buyer/pre-order` | ✅ Parity |
| Browse by Category | Yes | Yes | ✅ Parity |
| Product Cards with Sizes | Yes | Yes (improved UX) | ✅ Enhanced |
| Direct Quantity Entry | Yes | Yes (per-size inputs) | ✅ Parity |
| Available Qty Display | Yes | Yes | ✅ Parity |
| OnRoute Qty Display | Yes | Yes | ✅ Parity |
| Low Stock Indicator | ? | Yes (card-level warning) | ✅ Enhanced |
| **Customer Management** |
| Store Name Autocomplete | Yes | Yes (debounced search) | ✅ Parity |
| Auto-fill Customer Info | Yes | Yes | ✅ Parity |
| Auto-assign Rep | Yes | Yes (by customer code matching) | ✅ Parity |
| **Cart & Checkout** |
| Cart Summary | Yes | Yes (sticky sidebar) | ✅ Enhanced |
| Currency Toggle (CAD/USD) | Yes | Yes | ✅ Parity |
| Ship Date Window | Yes | Yes (with pre-order category dates) | ✅ Enhanced |
| Order Notes | Yes | Yes | ✅ Parity |
| Customer PO | Yes | Yes | ✅ Parity |
| Order Confirmation | Yes | Yes (`/buyer/confirmation/{id}`) | ✅ Parity |
| **Rep Portal Navigation** |
| Return to Rep Portal | ? | Yes (returnTo param preserved) | ✅ Implemented |
| Rep Context Through Flow | ? | Yes (repId param preserved) | ✅ Implemented |

---

## 2. Architecture Comparison

### Old System (.NET Web Forms)
```
├── RepLogin.aspx          → Rep authentication
├── RepOrders.aspx         → Rep's order list
├── MyOrder.aspx.cs        → Order creation/editing
├── SkusCategories.aspx.cs → ATS product browsing
├── PreOrder.aspx.cs       → Pre-order flow
├── ShopifySync.aspx.cs    → Shopify integration
└── ASP.NET Web Forms      → Server-rendered pages
```

### New System (Next.js App Router)
```
src/app/rep/
├── login/page.tsx           → Rep login (NextAuth)
├── (protected)/
│   ├── layout.tsx           → Rep portal layout
│   ├── page.tsx             → Redirects to /rep/orders
│   ├── orders/page.tsx      → Rep orders list
│   └── new-order/page.tsx   → Redirects to buyer flow with rep context

src/app/buyer/
├── select-journey/page.tsx  → ATS vs Pre-Order selection
├── ats/page.tsx             → ATS category listing
├── ats/[category]/page.tsx  → Category products
├── pre-order/page.tsx       → Pre-order collections
├── my-order/page.tsx        → Cart review & checkout
└── confirmation/[id]/page.tsx → Order confirmation
```

---

## 3. UX Improvements in New System

### 3.1 Modern, Responsive Interface
- **Mobile-first design**: Product cards adapt from mobile to tablet to desktop
- **Tailwind CSS**: Consistent design tokens for spacing, colors, typography
- **shadcn/ui components**: Accessible, well-tested UI primitives

### 3.2 Enhanced Product Ordering Experience
- **Direct grid-based quantity entry**: Size/Available/OnRoute/Order in a clear grid
- **Visual low stock indicators**: Amber badges alert reps to limited inventory
- **Real-time cart totals**: Footer shows units and price per product
- **Currency toggle**: Easy CAD/USD switching in header

### 3.3 Streamlined Navigation
- **Rep context preservation**: `repId` and `returnTo` params flow through entire buyer journey
- **Automatic return to rep portal**: After order submission, reps return to `/rep/orders`
- **Success toast**: Order confirmation with customer name shown

### 3.4 Smart Customer Selection
- **Debounced autocomplete**: 300ms delay prevents excessive API calls
- **Full customer auto-fill**: Address, contact info, website populated automatically
- **Rep auto-assignment**: When customer is selected, their assigned rep is locked

### 3.5 Better Order Management
- **Status badges**: Color-coded status indicators (Pending, Processing, Shipped, etc.)
- **Status counts**: Dropdown shows count per status for quick filtering
- **Edit capability**: Only pending orders not yet in Shopify can be edited

---

## 4. Identified Gaps & Recommendations

### 4.1 Rep Dashboard Enhancement (Priority: High)
**Current State**: Rep portal is minimal - just orders list with "New Order" button.

**Recommendations**:
1. Add dashboard metrics on `/rep` page:
   - Total orders this month/quarter/year
   - Total revenue generated
   - Orders by status pie chart
   - Recent activity feed

2. Add quick actions:
   - "Continue incomplete order" if cart has items
   - "Reorder for customer" (duplicate recent order)

### 4.2 Customer Quick Access (Priority: Medium)
**Current State**: Reps must start order flow to see customer info.

**Recommendations**:
1. Add "My Customers" page (`/rep/customers`) showing:
   - Customers assigned to this rep
   - Recent order history per customer
   - Quick "New Order" button per customer

### 4.3 Order Status Notifications (Priority: Medium)
**Current State**: Reps must check orders page to see status changes.

**Recommendations**:
1. Add email notifications when orders are:
   - Processed (sent to Shopify)
   - Shipped
   - Invoiced

2. Add in-app notifications bell with recent status changes

### 4.4 Mobile Optimization (Priority: Medium)
**Current State**: Responsive but could be better for field reps.

**Recommendations**:
1. Add bottom navigation bar on mobile for quick access
2. Swipe actions on orders list (Edit, View PDF)
3. Larger touch targets for quantity inputs on mobile

### 4.5 Offline Support (Priority: Low)
**Recommendation**: Consider PWA capabilities for reps in areas with poor connectivity:
- Cache product catalog
- Queue orders for sync when online

---

## 5. Performance Analysis

### Current Strengths
- **Server Components**: Pages like `/rep/orders` fetch data server-side, reducing client bundle
- **Manual Pagination**: Server-side pagination with configurable page size
- **Dynamic Imports**: Heavy components loaded on demand

### Recommendations
1. **Add loading states**: Currently uses Next.js loading conventions, could add skeleton screens
2. **Optimize images**: Product images should use next/image with blur placeholders
3. **Add caching headers**: API routes could benefit from stale-while-revalidate caching

---

## 6. Security Analysis

### Current Implementations
- **Auth Middleware**: Rep routes protected by NextAuth session
- **Role Validation**: `session.user.role === 'rep'` check
- **Rep ID Verification**: Orders filtered by `session.user.repId`
- **Secure Redirects**: `isValidReturnTo()` prevents open redirect attacks

### Recommendations
1. **Rate Limiting**: Add rate limiting to export endpoints
2. **Audit Logging**: Log order creation/edit events with rep ID

---

## 7. Comparison with Legacy .NET Behavior

Based on code comments referencing ".NET parity", the new system maintains:

| .NET Behavior | New Implementation | File Reference |
|--------------|-------------------|----------------|
| ATS caps at available qty | `getMaxOrderable()` returns `variant.available` | `product-order-card.tsx:27` |
| PreOrder has no qty cap | Returns 9999 for PreOrder | `product-order-card.tsx:29` |
| Show if available > 0 OR onRoute > 0 | `isVariantOrderable()` filter | `product-order-card.tsx:38` |
| OnRoute flag logic | PreOrder lines marked OnRoute | `product-order-card.tsx:46` |
| Rep lands on orders after login | Redirect `/rep` → `/rep/orders` | `rep/(protected)/page.tsx:8` |

---

## 8. Test Coverage

The codebase includes .NET parity tests in `src/__tests__/onroute-logic.test.ts`:
- Quantity cap logic
- isOnRoute flag logic
- Variant filter logic
- Low stock logic

**Recommendation**: Add E2E tests for full rep workflow:
1. Login as rep
2. Create new order through buyer flow
3. Return to rep portal
4. Verify order appears in list
5. Edit order items
6. Export orders to Excel

---

## 9. Conclusion

The new orderhubnow.com platform provides **feature parity** with the legacy inventory.limeapple.ca system while offering **significant UX improvements**:

- Modern, responsive design
- Faster navigation with client-side routing
- Better visual feedback (toasts, loading states)
- Enhanced product ordering grid
- Streamlined rep context flow

The primary opportunities for improvement are:
1. **Richer rep dashboard** with metrics and quick actions
2. **Customer management** features for reps
3. **Notifications** for order status changes
4. **Mobile-specific optimizations** for field sales

Overall, the new platform is well-architected and ready for production use by sales reps.

---

## Appendix: File References

| Feature | Primary Files |
|---------|---------------|
| Rep Login | `src/app/rep/login/page.tsx` |
| Rep Layout | `src/app/rep/(protected)/layout.tsx` |
| Rep Orders | `src/app/rep/(protected)/orders/page.tsx` |
| Orders Table | `src/components/rep/rep-orders-table.tsx` |
| New Order Flow | `src/app/rep/(protected)/new-order/page.tsx` |
| Buyer Journey | `src/app/buyer/select-journey/page.tsx` |
| Product Card | `src/components/buyer/product-order-card.tsx` |
| Order Form | `src/components/buyer/order-form.tsx` |
| Rep Context Utils | `src/lib/utils/rep-context.ts` |
| Orders Export | `src/app/api/rep/orders/export/route.ts` |
