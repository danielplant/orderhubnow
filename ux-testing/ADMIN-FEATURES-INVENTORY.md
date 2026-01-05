# OrderHubNow Admin Features Inventory

## Executive Summary

This document provides a complete inventory of all admin features available in the OrderHubNow platform. The admin portal offers comprehensive management capabilities across orders, products, inventory, customers, sales reps, and integrations.

---

## 1. Dashboard Overview

**URL:** `/admin`

The admin dashboard provides at-a-glance metrics and actionable insights:

### Key Performance Indicators
- **Orders Count** - Total orders with period-over-period trend
- **Revenue** - Total revenue with trend analysis
- **Units in Stock** - Current inventory levels
- **Pending Shopify Syncs** - Items awaiting synchronization

### Dashboard Widgets

| Widget | Purpose | Data Source |
|--------|---------|-------------|
| Category Totals | Inventory breakdown by category | `dashboard.ts:getCategoryTotals()` |
| PO Sold | Pre-order committed quantities | `dashboard.ts:getPOSoldData()` |
| Exception Alerts | Critical business exceptions (max 5) | `reports.ts:getExceptionReport()` |
| At-Risk Accounts | Customers overdue for ordering | `reports.ts:getAtRiskAccounts()` |

---

## 2. Reports System

**URL:** `/admin/reports`

### Available Report Types

#### 1. Category Totals Report
- **Purpose:** Inventory analysis by main and sub-categories
- **Key Metrics:** Stock levels, category breakdown
- **Layout:** Grouped, flat

#### 2. PO Sold Report
- **Purpose:** Pre-order inventory with size bucket breakdowns
- **Key Metrics:** Committed quantities, size distribution
- **Layout:** Pivot, grouped

#### 3. Exception Report
- **Purpose:** Business exception tracking and alerts
- **Categories:**
  - Late accounts (>90 days overdue)
  - Declining accounts (>25% decline)
  - Dead SKUs (no sales in 90+ days)
  - Hot SKUs (>80% of inventory sold)
  - Stalled new accounts (no orders in 60 days)
  - Underperforming products (<50% of target)

#### 4. Cohort Retention Report
- **Purpose:** Monthly customer retention analysis
- **Key Metrics:** M1, M2, M3, M6, M12 retention rates, LTV
- **Visualization:** Heatmap

#### 5. Account Potential Report
- **Purpose:** Customer segmentation and potential analysis
- **Quadrants:** Stars, Develop, Maintain, Harvest
- **Visualization:** Quadrant chart

#### 6. SKU Velocity Report
- **Purpose:** Inventory movement and sales velocity
- **Key Metrics:** Days of supply, sell-through rate

#### 7. Rep Scorecard Report
- **Purpose:** Sales representative performance tracking
- **Key Metrics:** Active accounts, revenue, target %, rank, AOV

#### 8. Customer LTV Report
- **Purpose:** Customer lifetime value analysis
- **Key Metrics:** Total spend, order frequency, segment

#### 9. First-to-Second Conversion Report
- **Purpose:** New customer conversion tracking
- **Key Metrics:** Conversion rates, time to second order
- **Visualization:** Funnel chart

### Report Features

| Feature | Description |
|---------|-------------|
| Type Selector | Switch between report types |
| Date Range | Filter data by time period |
| Column Selection | Customize visible columns |
| Advanced Filters | Multi-criteria filtering |
| Saved Views | Save and recall filter configurations |
| Export XLSX | Download as Excel spreadsheet |
| Export CSV | Download as comma-separated values |
| Export PDF | Download as printable document |
| Export PNG | Download chart as image |

---

## 3. Orders Management

**URL:** `/admin/orders`

### List View Features
- Full-text search across order fields
- Status filtering (Pending, Processing, Shipped, Delivered, Cancelled)
- Rep filtering
- Date range filtering
- Sortable columns
- Pagination

### Bulk Operations
- Bulk status updates
- Export selected orders
- Bulk PDF generation

### Order Detail View (`/admin/orders/[id]`)
- Complete order information
- Line item details with pricing
- Customer information
- Shipping details
- Order comments/notes (add, view, edit)
- Status update workflow
- Rep assignment
- PDF generation
- Order duplication
- Shopify transfer

### Available Actions
| Action | Description |
|--------|-------------|
| `updateOrderStatus()` | Change order status |
| `bulkUpdateStatus()` | Update multiple orders |
| `addOrderComment()` | Add internal notes |
| `updateOrderRep()` | Reassign to different rep |
| `duplicateOrder()` | Create copy of order |
| `transferOrderToShopify()` | Sync to Shopify |

---

## 4. Products Management

**URL:** `/admin/products`

### Features
- Product listing with search
- Category filtering
- SKU management per product
- Image management
- Pricing configuration
- Pre-order flag toggle

### Product Creation (`/admin/products/new`)
- Product details form
- Multi-SKU support
- Image upload
- Category assignment
- Pricing matrix

### SKU Operations
| Action | Description |
|--------|-------------|
| `createSku()` | Add new SKU |
| `updateSku()` | Edit SKU details |
| `deleteSku()` | Remove SKU |
| `bulkDeleteSkus()` | Remove multiple SKUs |
| `setSkuPreOrderFlag()` | Toggle pre-order status |
| `bulkSetPreOrderFlag()` | Bulk pre-order toggle |

### Import/Export
- Upload products from file
- Export product list (XLSX, CSV, PDF)

---

## 5. Categories Management

**URL:** `/admin/categories`

### Hierarchy Management
- Main categories
- Sub-categories (nested under main)
- Drag-and-drop reordering

### Category Operations
| Action | Description |
|--------|-------------|
| `createMainCategory()` | Add main category |
| `updateMainCategory()` | Edit main category |
| `deleteMainCategory()` | Remove main category |
| `createSubCategory()` | Add sub-category |
| `updateSubCategory()` | Edit sub-category |
| `deleteSubCategory()` | Remove sub-category |
| `reorderCategories()` | Change category order |
| `reorderProductsInCategory()` | Change product order |
| `updateProductPriority()` | Set product priority |

### Image Management
- Category image upload
- Image preview
- Category PDF export with images

---

## 6. Inventory Management

**URL:** `/admin/inventory`

### Filtering Options
- **All:** Complete inventory list
- **On-Route:** Items currently in transit
- **Low Stock:** Items below reorder point
- **Critical Stock:** Items near stockout

### Inventory Operations
| Action | Description |
|--------|-------------|
| `updateInventoryQuantity()` | Adjust stock levels |
| `updateInventoryOnRoute()` | Track incoming inventory |

### Features
- SKU search
- Quantity editing inline
- Stock status indicators
- Sortable columns

---

## 7. Customers Management

**URL:** `/admin/customers`

### List Features
- Customer search
- Rep filtering
- Pagination
- Sortable columns

### Customer Operations
| Action | Description |
|--------|-------------|
| `createCustomer()` | Add new customer |
| `updateCustomer()` | Edit customer details |
| `deleteCustomer()` | Remove customer |
| `suggestStoreNames()` | Autocomplete store names |
| `getCustomerForAutoFill()` | Quick data population |

### Import Options
- Manual import form
- Excel file import
- Shopify customer sync

### Export
- Export customer list (XLSX, CSV)

---

## 8. Sales Reps Management

**URL:** `/admin/reps`

### Rep Operations
| Action | Description |
|--------|-------------|
| `createRep()` | Add new sales rep |
| `updateRep()` | Edit rep details |
| `deleteRep()` | Remove rep account |
| `getInviteLink()` | Generate invitation URL |
| `resendInvite()` | Re-send invite email |
| `forcePasswordReset()` | Require password change |
| `enableRep()` | Activate rep account |
| `disableRep()` | Deactivate rep account |

### Features
- Rep listing with status
- Credential management
- Performance metrics link
- Territory/region assignment

---

## 9. Prepacks Configuration

**URL:** `/admin/prepacks`

### Purpose
Map individual sizes to prepack configurations for bulk ordering.

### Operations
| Action | Description |
|--------|-------------|
| `createPPSize()` | Add prepack mapping |
| `updatePPSize()` | Edit prepack config |
| `deletePPSize()` | Remove prepack |

---

## 10. Shopify Integration

**URL:** `/admin/shopify`

### Sync Status
- Overall sync health
- Last sync timestamp
- Pending items count

### Missing SKUs Management
- List of Shopify SKUs not in inventory
- Ignore individual/bulk
- Add to inventory individual/bulk

### Pending Transfers
- Orders awaiting Shopify sync
- Manual transfer trigger
- Bulk transfer operations

### Operations
| Action | Description |
|--------|-------------|
| `ignoreMissingSku()` | Skip SKU sync |
| `bulkIgnoreMissingSkus()` | Skip multiple SKUs |
| `addMissingSkuToInventory()` | Create inventory record |
| `bulkAddMissingSkus()` | Add multiple SKUs |
| `transferOrderToShopify()` | Sync order to Shopify |

### Sync History
- Log of all sync operations
- Success/failure status
- Timestamp and details

---

## 11. Settings

**URL:** `/admin/settings`

### Configuration Options
- Inventory settings (thresholds, alerts)
- System preferences

### Utility Operations
| Action | Description |
|--------|-------------|
| `updateInventorySettings()` | Save settings |
| `resizeSkuImages300x450()` | Batch image resize |
| `minimizeBigImages()` | Image optimization |

---

## 12. API Endpoints Summary

### Report APIs
- `GET /api/reports` - Fetch report data
- `GET /api/reports/po-sold` - PO sold data
- `GET /api/reports/totals` - Report totals
- `POST /api/reports/export` - Export reports

### Order APIs
- `GET/POST/PATCH /api/orders` - Order CRUD
- `GET/PATCH /api/orders/[id]` - Single order
- `POST /api/orders/[id]/comments` - Comments
- `GET /api/orders/[id]/pdf` - Generate PDF
- `POST /api/orders/export` - Export orders

### Product APIs
- `GET/POST/PATCH /api/products` - Product CRUD
- `POST /api/products/upload` - Bulk upload
- `POST /api/products/export` - Export products

### Category APIs
- `GET/POST/PATCH /api/categories` - Category CRUD
- `GET/PATCH/DELETE /api/categories/[id]` - Single category
- `POST /api/categories/[id]/image` - Image upload

### Customer APIs
- `GET/POST/PATCH /api/customers` - Customer CRUD
- `POST /api/customers/import` - Import
- `POST /api/customers/import-excel` - Excel import
- `POST /api/customers/import-shopify` - Shopify import

### Shopify APIs
- `POST /api/shopify/sync` - Trigger sync
- `POST /api/shopify/transfer` - Transfer orders

---

## Component Architecture

### Data Tables (reusable)
- `orders-table.tsx`
- `products-table.tsx`
- `customers-table.tsx`
- `reps-table.tsx`
- `inventory-table.tsx`
- `prepacks-table.tsx`
- `missing-skus-table.tsx`
- `report-data-table.tsx`

### Report Visualizations
- `cohort-heatmap.tsx` - Retention analysis
- `quadrant-chart.tsx` - Potential analysis
- `funnel-chart.tsx` - Conversion funnel
- `velocity-table.tsx` - SKU velocity
- `scorecard-table.tsx` - Rep performance

### Modals
- `order-comments-modal.tsx`
- `product-order-modal.tsx`
- `customer-import-modal.tsx`
- `customer-excel-import-modal.tsx`
- `upload-products-modal.tsx`
- `category-image-modal.tsx`

---

*Document generated: 2026-01-05*
*Source: OrderHubNow codebase analysis*
