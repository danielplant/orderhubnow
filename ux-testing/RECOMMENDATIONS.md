# UX Improvement Recommendations for OrderHub Now

**Date:** January 5, 2026
**Priority Levels:** P0 (Critical), P1 (High), P2 (Medium), P3 (Nice to Have)

---

## Overview

This document provides specific, actionable recommendations for improving the OrderHub Now platform based on the UX comparison with the legacy inventory.limeapple.ca system. Each recommendation includes the affected user role, implementation complexity, and suggested approach.

---

## P0 - Critical Improvements

### 1. Shopify Sync Resilience

**Affected Roles:** Admin
**Complexity:** Medium
**Current State:** Sync can fail silently; missing SKUs require manual review

**Recommendations:**
```
1. Add retry logic with exponential backoff
   - File: /src/lib/shopify/sync.ts
   - Implement: 3 retries with 2s, 4s, 8s delays

2. Add email notifications on sync failures
   - Send to admin email from settings
   - Include error details and last successful sync time

3. Add sync health dashboard widget
   - Show: Last sync time, success rate, pending items
   - Alert: If no successful sync in 24 hours
```

### 2. Order Data Validation

**Affected Roles:** All
**Complexity:** Low
**Current State:** Some edge cases may bypass validation

**Recommendations:**
```
1. Strengthen server-side validation
   - File: /src/lib/data/actions/orders.ts
   - Add: Quantity cannot exceed available stock
   - Add: Price validation against current database values

2. Add order integrity checks
   - Verify SKUs exist before order creation
   - Validate rep exists and is active
   - Check customer ID ownership
```

---

## P1 - High Priority Improvements

### 3. Enhanced Order Search

**Affected Roles:** Admin, Rep
**Complexity:** Medium
**Files to Modify:**
- `/src/lib/data/queries/orders.ts`
- `/src/components/admin/orders-table.tsx`
- `/src/components/rep/rep-orders-table.tsx`

**Recommendations:**
```
1. Add search across multiple fields:
   - Order number (current)
   - Customer email
   - Customer PO
   - Buyer name
   - Phone number

2. Add advanced filter builder:
   - Date range (ship dates, order date)
   - Amount range (min/max)
   - Multiple status selection
   - Category filter

3. Add saved searches:
   - Store filter combinations
   - Quick access dropdown
```

### 4. Improved Rep Order Editing

**Affected Roles:** Rep
**Complexity:** Medium
**Current State:** Can only edit Pending orders not transferred to Shopify

**Recommendations:**
```
1. Allow editing Processing orders (with audit trail)
   - File: /src/lib/data/actions/orders.ts
   - Add: OrderHistory table for change tracking
   - Add: Reason field for edits

2. Add order duplication feature:
   - "Duplicate Order" button
   - Pre-fills with existing order data
   - Useful for repeat orders

3. Add order notes visible to rep:
   - Internal notes (admin only)
   - Rep notes (visible to rep)
```

### 5. Bulk Customer Operations

**Affected Roles:** Admin
**Complexity:** Medium
**Files to Modify:**
- `/src/components/admin/customers-table.tsx`
- `/src/lib/data/actions/customers.ts`

**Recommendations:**
```
1. Add bulk selection to customers table
   - Checkbox column
   - Select all on page / Select all matching

2. Add bulk operations:
   - Bulk delete (with confirmation)
   - Bulk rep assignment
   - Bulk export selection

3. Add customer merge feature:
   - Detect duplicate customers
   - Merge and consolidate order history
```

### 6. Mobile PWA Support

**Affected Roles:** Buyer, Rep
**Complexity:** High
**Current State:** Responsive but no offline support

**Recommendations:**
```
1. Add service worker for offline cart
   - Cache cart state locally
   - Queue orders for submission when online
   - Show offline indicator

2. Add app-like features:
   - Install prompt
   - Push notifications for order updates
   - Home screen icon

3. Optimize for mobile performance:
   - Reduce JavaScript bundle size
   - Implement virtual scrolling for long lists
   - Optimize images for mobile bandwidth
```

---

## P2 - Medium Priority Improvements

### 7. Dashboard Customization

**Affected Roles:** Admin
**Complexity:** Medium
**Files to Create:**
- `/src/components/admin/dashboard-builder.tsx`
- `/src/lib/contexts/dashboard-context.tsx`

**Recommendations:**
```
1. Add drag-and-drop widget arrangement
   - Use: react-beautiful-dnd or @dnd-kit/core
   - Store layout in localStorage or user settings

2. Add widget visibility toggle:
   - Show/hide individual widgets
   - Collapse/expand widgets

3. Add saved dashboard layouts:
   - "Sales View" vs "Inventory View"
   - Quick switch between layouts
```

### 8. Real-time Order Updates

**Affected Roles:** Admin, Rep
**Complexity:** High
**Current State:** Manual page refresh required

**Recommendations:**
```
1. Add WebSocket connection for live updates
   - Order status changes
   - New order notifications
   - Shopify sync status

2. Add polling fallback:
   - Every 30 seconds for orders list
   - Every 5 seconds for dashboard metrics

3. Add visual indicators:
   - "Updated just now" timestamp
   - Highlight newly changed rows
   - Toast for new orders
```

### 9. Enhanced Category Management

**Affected Roles:** Admin
**Complexity:** Low
**Files to Modify:**
- `/src/app/admin/(protected)/categories/page.tsx`
- `/src/components/admin/categories-table.tsx`

**Recommendations:**
```
1. Add category reordering:
   - Drag-and-drop to set display order
   - Move up/down buttons

2. Add category hierarchy:
   - Parent/child categories
   - Nested navigation in buyer portal

3. Add category analytics:
   - Sales by category over time
   - Top selling SKUs per category
```

### 10. Order History Timeline

**Affected Roles:** Admin
**Complexity:** Medium
**Files to Create:**
- `/src/components/admin/order-timeline.tsx`

**Recommendations:**
```
1. Add visual timeline to order detail:
   - Status changes with timestamps
   - User who made change
   - Comments added
   - Shopify transfer events

2. Add email history:
   - Confirmation sent
   - Shipping notification
   - Follow-up emails
```

---

## P3 - Nice to Have Improvements

### 11. Dark Mode Support

**Affected Roles:** All
**Complexity:** Low
**Current State:** Light theme only

**Recommendations:**
```
1. Add theme toggle in header
   - File: /src/components/ui/theme-toggle.tsx
   - Use: next-themes (already installed)

2. Define dark color palette:
   - Update Tailwind config
   - Use CSS custom properties for colors

3. Test all components in dark mode:
   - Charts and visualizations
   - Form inputs
   - Data tables
```

### 12. Keyboard Shortcuts

**Affected Roles:** Admin
**Complexity:** Low
**Files to Create:**
- `/src/lib/hooks/use-keyboard-shortcuts.ts`
- `/src/components/admin/shortcuts-modal.tsx`

**Recommendations:**
```
Suggested shortcuts:
- Cmd/Ctrl + K: Focus search
- Cmd/Ctrl + N: New order
- Cmd/Ctrl + /: Show shortcuts help
- G then O: Go to Orders
- G then P: Go to Products
- G then C: Go to Customers
- Escape: Close modal/clear selection
```

### 13. Advanced Reporting Export

**Affected Roles:** Admin
**Complexity:** Medium
**Current State:** CSV and Excel export

**Recommendations:**
```
1. Add scheduled reports:
   - Daily/weekly/monthly email
   - Select report type and filters
   - PDF attachment option

2. Add report templates:
   - Save filter combinations
   - Share templates with other admins

3. Add chart export:
   - Download charts as PNG/SVG
   - Include in PDF reports
```

### 14. Customer Portal (Future)

**Affected Roles:** Buyer
**Complexity:** High
**Current State:** No customer self-service

**Recommendations:**
```
1. Add customer login:
   - View order history
   - Track order status
   - Update contact info

2. Add reorder functionality:
   - "Order again" button
   - Favorite products list

3. Add customer communication:
   - In-app messaging with rep
   - Order inquiry system
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] P0: Shopify sync resilience
- [ ] P0: Order data validation
- [ ] P1: Enhanced order search

### Phase 2: Rep Experience (Weeks 3-4)
- [ ] P1: Improved rep order editing
- [ ] P2: Real-time order updates (polling)
- [ ] P3: Keyboard shortcuts

### Phase 3: Admin Tools (Weeks 5-6)
- [ ] P1: Bulk customer operations
- [ ] P2: Dashboard customization
- [ ] P2: Order history timeline

### Phase 4: Mobile & Polish (Weeks 7-8)
- [ ] P1: Mobile PWA support
- [ ] P3: Dark mode support
- [ ] P2: Enhanced category management

### Phase 5: Advanced Features (Future)
- [ ] P2: WebSocket real-time updates
- [ ] P3: Advanced reporting export
- [ ] P3: Customer portal

---

## Technical Debt Items

### Code Quality
1. Add comprehensive test coverage
   - Unit tests for actions and queries
   - Integration tests for API routes
   - E2E tests for critical flows

2. Add error boundary components
   - Graceful error handling
   - Error reporting to monitoring

3. Add performance monitoring
   - Core Web Vitals tracking
   - Database query performance

### Documentation
1. Add API documentation
   - OpenAPI/Swagger spec
   - Request/response examples

2. Add component Storybook
   - Visual component library
   - Interactive examples

3. Add deployment runbook
   - Environment setup
   - Migration procedures
   - Rollback instructions

---

## Success Metrics

Track these metrics to measure improvement impact:

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Page load time | ~2s | <1s | Lighthouse, Web Vitals |
| Order creation time | ~30s | <15s | User timing API |
| Search response time | ~500ms | <200ms | Server timing |
| Mobile usage | ~5% | >25% | Analytics |
| Support tickets | Baseline | -30% | Support system |
| User satisfaction | Baseline | +20% | NPS survey |

---

## Appendix: File Index

Key files for each improvement area:

```
Orders:
├── /src/app/admin/(protected)/orders/page.tsx
├── /src/components/admin/orders-table.tsx
├── /src/lib/data/queries/orders.ts
└── /src/lib/data/actions/orders.ts

Customers:
├── /src/app/admin/(protected)/customers/page.tsx
├── /src/components/admin/customers-table.tsx
├── /src/lib/data/queries/customers.ts
└── /src/lib/data/actions/customers.ts

Dashboard:
├── /src/app/admin/(protected)/page.tsx
├── /src/components/admin/dashboard-*.tsx
└── /src/lib/data/queries/dashboard.ts

Shopify:
├── /src/app/admin/(protected)/shopify/page.tsx
├── /src/lib/shopify/sync.ts
└── /src/app/api/shopify/*.ts

Buyer:
├── /src/app/buyer/*/page.tsx
├── /src/components/buyer/*.tsx
└── /src/lib/contexts/order-context.tsx

Rep:
├── /src/app/rep/(protected)/*/page.tsx
├── /src/components/rep/*.tsx
└── /src/lib/utils/rep-context.ts
```
