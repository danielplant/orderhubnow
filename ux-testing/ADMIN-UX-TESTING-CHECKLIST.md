# Admin UX Testing Checklist

## Overview

This document provides a comprehensive UX testing checklist for comparing the **old inventory.limeapple.ca/USA** site against the **new orderhubnow.com** admin portal.

**Admin Credentials:**
- Username: `LimeAdmin`
- Password: `Green2022###!`

---

## 1. Authentication & Access

### Login Flow
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| Admin login page | | `/admin/login` | | |
| Username/password authentication | | ✅ | | |
| Remember me option | | | | |
| Forgot password flow | | | | |
| Session persistence | | ✅ | | |
| Logout functionality | | ✅ | | |

---

## 2. Dashboard

### Main Dashboard (`/admin`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| **Key Metrics** | | | | |
| Orders count with trend | | ✅ | | Dashboard metrics widget |
| Revenue with trend | | ✅ | | |
| Units in stock | | ✅ | | |
| Pending Shopify syncs | | ✅ | | |
| **Widgets** | | | | |
| Category totals breakdown | | ✅ | | category-totals-widget.tsx |
| Pre-order (PO) sold data | | ✅ | | po-sold-widget.tsx |
| Exception alerts (max 5) | | ✅ | | exception-alerts-widget.tsx |
| At-risk accounts | | ✅ | | at-risk-accounts-widget.tsx |

---

## 3. Reports System

### Reports Page (`/admin/reports`)

#### Report Types
| Report | Old Site | New Site | Status | Notes |
|--------|----------|----------|--------|-------|
| Category Totals | | ✅ | | Inventory by main/sub categories |
| PO Sold | | ✅ | | Pre-order inventory with size buckets |
| Exception Report | | ✅ | | Late accounts, declining, dead SKUs, hot SKUs |
| Cohort Retention | | ✅ | | Monthly cohort M1-M12 retention + LTV |
| Account Potential | | ✅ | | Quadrant classification (stars/develop/maintain/harvest) |
| SKU Velocity | | ✅ | | Days of supply, sales velocity |
| Rep Scorecard | | ✅ | | Rep performance rankings |
| Customer LTV | | ✅ | | Lifetime value by customer |
| First-to-Second Conversion | | ✅ | | Conversion cohort analysis |

#### Report Features
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| Report type selector | | ✅ | | |
| Date range filters | | ✅ | | |
| Column selection | | ✅ | | columns-popover.tsx |
| Filter configuration | | ✅ | | filters-popover.tsx |
| Saved views | | ✅ | | saved-views-popover.tsx |
| Export to XLSX | | ✅ | | |
| Export to CSV | | ✅ | | |
| Export to PDF | | ✅ | | |
| Grouped layout | | ✅ | | report-grouped.tsx |
| Pivot table layout | | ✅ | | report-pivot.tsx |
| Cohort heatmap | | ✅ | | cohort-heatmap.tsx |
| Quadrant chart | | ✅ | | quadrant-chart.tsx |
| Funnel chart | | ✅ | | funnel-chart.tsx |

---

## 4. Orders Management

### Orders List (`/admin/orders`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View all orders | | ✅ | | |
| Search orders | | ✅ | | |
| Filter by status | | ✅ | | |
| Filter by rep | | ✅ | | |
| Filter by date range | | ✅ | | |
| Bulk status updates | | ✅ | | bulk-actions-bar.tsx |
| Export orders | | ✅ | | |
| Export to PDF | | ✅ | | |

### Order Detail (`/admin/orders/[id]`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View order details | | ✅ | | |
| Update order status | | ✅ | | |
| Add order comments | | ✅ | | order-comments-modal.tsx |
| Assign/change rep | | ✅ | | |
| Generate PDF | | ✅ | | |
| Duplicate order | | ✅ | | |
| Transfer to Shopify | | ✅ | | |

---

## 5. Products Management

### Products List (`/admin/products`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View all products | | ✅ | | |
| Search products | | ✅ | | |
| Filter by category | | ✅ | | |
| View SKUs | | ✅ | | |
| Edit product | | ✅ | | |
| Upload products | | ✅ | | upload-products-modal.tsx |
| Export products | | ✅ | | |
| Export to PDF | | ✅ | | |
| Bulk delete SKUs | | ✅ | | |
| Toggle pre-order flag | | ✅ | | |

### New Product (`/admin/products/new`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| Create new product | | ✅ | | |
| Add SKUs | | ✅ | | |
| Set pricing | | ✅ | | |
| Upload images | | ✅ | | |
| Assign to category | | ✅ | | |

---

## 6. Categories Management

### Categories (`/admin/categories`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View category tree | | ✅ | | category-tree.tsx |
| Create main category | | ✅ | | |
| Create sub-category | | ✅ | | |
| Edit category | | ✅ | | |
| Delete category | | ✅ | | |
| Reorder categories | | ✅ | | |
| Reorder products in category | | ✅ | | |
| Upload category image | | ✅ | | category-image-modal.tsx |
| Export category PDF | | ✅ | | |

---

## 7. Inventory Management

### Inventory (`/admin/inventory`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View all inventory | | ✅ | | |
| Filter: All | | ✅ | | |
| Filter: On-Route | | ✅ | | |
| Filter: Low Stock | | ✅ | | |
| Filter: Critical Stock | | ✅ | | |
| Update stock quantity | | ✅ | | |
| Update on-route quantity | | ✅ | | |
| Search by SKU | | ✅ | | |

---

## 8. Customers Management

### Customers (`/admin/customers`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View all customers | | ✅ | | |
| Search customers | | ✅ | | |
| Filter by rep | | ✅ | | |
| Create customer | | ✅ | | |
| Edit customer | | ✅ | | |
| Delete customer | | ✅ | | |
| Import customers | | ✅ | | customer-import-modal.tsx |
| Import from Excel | | ✅ | | customer-excel-import-modal.tsx |
| Import from Shopify | | ✅ | | |
| Export customers | | ✅ | | |
| Store name autocomplete | | ✅ | | |

---

## 9. Sales Reps Management

### Sales Reps (`/admin/reps`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View all reps | | ✅ | | |
| Create new rep | | ✅ | | |
| Edit rep details | | ✅ | | |
| Delete rep | | ✅ | | |
| Generate invite link | | ✅ | | |
| Resend invite email | | ✅ | | |
| Force password reset | | ✅ | | |
| Enable/disable rep | | ✅ | | |

---

## 10. Prepacks Configuration

### Prepacks (`/admin/prepacks`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View prepack configurations | | ✅ | | |
| Create prepack size mapping | | ✅ | | |
| Edit prepack | | ✅ | | |
| Delete prepack | | ✅ | | |

---

## 11. Shopify Integration

### Shopify (`/admin/shopify`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| View sync status | | ✅ | | shopify-status-card.tsx |
| View sync history | | ✅ | | sync-history-list.tsx |
| View missing SKUs | | ✅ | | missing-skus-table.tsx |
| Ignore missing SKU | | ✅ | | |
| Bulk ignore missing SKUs | | ✅ | | |
| Add missing SKU to inventory | | ✅ | | |
| Bulk add missing SKUs | | ✅ | | |
| View pending transfers | | ✅ | | orders-pending-transfer-table.tsx |
| Manual sync trigger | | ✅ | | |
| Transfer order to Shopify | | ✅ | | |

---

## 12. Settings

### Settings (`/admin/settings`)
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| Inventory settings | | ✅ | | |
| System configuration | | ✅ | | |
| Image resizing tools | | ✅ | | |
| Image optimization | | ✅ | | |

---

## 13. Navigation & UX

### Sidebar Navigation
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| Collapsible sidebar | | ✅ | | admin-sidebar.tsx |
| Active state indicators | | ✅ | | |
| Icon + text labels | | ✅ | | |
| Quick access to all sections | | ✅ | | |

### General UX
| Feature | Old Site | New Site | Status | Notes |
|---------|----------|----------|--------|-------|
| Responsive design | | | | |
| Loading states | | | | |
| Error handling | | | | |
| Toast notifications | | | | |
| Confirmation dialogs | | | | |
| Keyboard shortcuts | | | | |
| Data table sorting | | | | |
| Data table pagination | | | | |
| Empty states | | ✅ | | empty-report-state.tsx |

---

## 14. Performance Considerations

| Metric | Old Site | New Site | Target | Notes |
|--------|----------|----------|--------|-------|
| Initial page load | | | < 3s | |
| Report generation | | | < 5s | |
| Table filtering | | | < 500ms | |
| Search response | | | < 300ms | |
| Export generation | | | < 10s | |

---

## Testing Instructions

### How to Test

1. **Open both sites side-by-side**
   - Old: https://inventory.limeapple.ca/USA
   - New: https://www.orderhubnow.com/admin

2. **Login to both sites** with credentials above

3. **For each feature section:**
   - Navigate to the corresponding page on both sites
   - Compare functionality and workflow
   - Note any differences in the "Notes" column
   - Mark "Status" as:
     - ✅ Equivalent or better
     - ⚠️ Partial/different
     - ❌ Missing
     - ➕ New feature (not in old site)

4. **Pay special attention to:**
   - Report accuracy and completeness
   - Data export functionality
   - Bulk operations
   - Performance differences

---

## Summary

### New Site Feature Count by Section
- Dashboard: 9 features
- Reports: 9 report types + 15 features
- Orders: 17 features
- Products: 16 features
- Categories: 10 features
- Inventory: 8 features
- Customers: 12 features
- Sales Reps: 9 features
- Prepacks: 4 features
- Shopify: 11 features
- Settings: 4 features

**Total: 44+ admin components, 51 server actions, 30+ data queries**

---

## Gap Analysis Template

| Missing from New Site | Priority | Effort | Notes |
|-----------------------|----------|--------|-------|
| | | | |

| New Features Not in Old Site | Value | Notes |
|------------------------------|-------|-------|
| | | |

---

*Last updated: 2026-01-05*
