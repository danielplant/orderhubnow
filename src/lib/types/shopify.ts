/**
 * Shopify Integration Types
 * 
 * Types for the Shopify sync, missing SKUs, and order transfer functionality.
 */

// ============================================================================
// Sync Status
// ============================================================================

export interface ShopifySyncStatus {
  isConnected: boolean
  lastSyncTime?: Date
  lastSyncStatus: 'success' | 'partial' | 'failed' | 'never'
  lastSyncErrors?: string[]
  productsSynced: number
  customersSynced: number
  pendingSync: number
}

export interface ShopifySyncHistoryEntry {
  syncTime: Date
  itemCount: number
  status: 'completed' | 'partial' | 'failed' | 'in_progress'
  syncType?: 'scheduled' | 'on-demand'
}

export interface ShopifySyncRunInfo {
  id: string
  syncType: 'scheduled' | 'on-demand'
  status: 'started' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  operationId?: string
  startedAt: Date
  completedAt?: Date
  itemCount?: number
  errorMessage?: string
}

// ============================================================================
// Missing SKUs
// ============================================================================

export type MissingSkuStatus = 'pending' | 'reviewed'

export interface MissingShopifySku {
  id: string
  skuId: string
  description: string
  quantity: number
  price: string
  priceCAD: string
  priceUSD: string
  fabricContent: string
  skuColor: string
  season: string
  categoryId: number
  orderEntryDescription: string
  msrpCAD: string
  msrpUSD: string
  dateAdded: Date
  dateModified: Date
  isReviewed: boolean
  shopifyProductVariantId?: string
}

export interface MissingSkusFilters {
  status?: 'pending' | 'reviewed' | 'all'
  search?: string
}

export interface MissingSkusResult {
  skus: MissingShopifySku[]
  total: number
  statusCounts: {
    pending: number
    reviewed: number
    all: number
  }
}

// ============================================================================
// Order Transfer
// ============================================================================

export interface ShopifyTransferResult {
  success: boolean
  shopifyOrderId?: string
  shopifyOrderNumber?: string
  missingSkus?: string[]
  inactiveSkus?: string[]
  customerCreated?: boolean
  error?: string
  errors?: string[]
}

// ============================================================================
// Order Validation (Pre-Transfer Check)
// ============================================================================

export type InventoryItemStatus = 'ok' | 'partial' | 'backorder'

export interface InventoryStatusItem {
  sku: string
  ordered: number
  available: number
  status: InventoryItemStatus
}

// Tag source types for the Transfer Preview modal
export type TagSource =
  | 'orderType'
  | 'wholesale'
  | 'oscIgnore'
  | 'salesRep'
  | 'shipWindow'
  | 'season'
  | 'ohnCollection'
  | 'shopifyCollection'
  | 'customerWholesale'
  | 'customerSalesRep'

export type TagScope = 'order' | 'customer'

export interface TagValidation {
  valid: boolean
  reason?: string  // e.g., "contains invalid characters", "too long"
  originalValue?: string  // The value before sanitization (if different)
}

export interface TransferTag {
  id: string
  scope: TagScope
  source: TagSource
  value: string
  enabled: boolean
  validation: TagValidation
}

export interface ShopifyValidationResult {
  valid: boolean
  orderId: string
  orderNumber: string
  storeName: string
  orderAmount: number
  itemCount: number
  missingSkus: string[]
  inactiveSkus: string[]
  customerEmail: string | null
  customerExists: boolean
  // Shopify customer lookup result
  shopifyCustomer?: {
    id: number
    firstName: string | null
    lastName: string | null
  }
  shopifyCustomerLookupError?: string
  // Derived name comparison
  ohnCustomerName: string
  shopifyCustomerName: string | null
  customerNameStatus: 'new' | 'match' | 'discrepancy' | 'unknown' | 'no_email'
  inventoryStatus: InventoryStatusItem[]
  // Enhanced fields for Transfer Preview modal
  shipWindow: string | null          // Formatted "Jan 15 – Jan 22, 2026"
  shipWindowTag: string | null       // For Shopify tag: "2026-01-15_2026-01-22"
  ohnCollection: string | null       // OHN collection name (from Sku.CollectionID)
  shopifyCollectionRaw: string | null        // Single Shopify raw value or "Mixed" if multiple
  shopifyCollectionRawValues: string[]       // All unique Shopify raw values (for tags)
  salesRep: string | null            // Sales rep name
  // Tags for transfer (can be toggled in UI)
  tags: TransferTag[]
  // True if any tag failed validation (would cause Shopify to reject)
  hasInvalidTags: boolean
}

// ============================================================================
// Bulk Transfer
// ============================================================================

export interface BulkTransferOrderResult {
  orderId: string
  orderNumber: string
  success: boolean
  shopifyOrderNumber?: string
  error?: string
}

export interface BulkTransferResult {
  success: number
  failed: number
  results: BulkTransferOrderResult[]
}

// ============================================================================
// Synced Products (for future enhancement)
// ============================================================================

export interface ShopifySyncedProduct {
  skuId: string
  shopifyProductId: string
  shopifyVariantId: string
  title: string
  shopifyPrice: number
  localPrice: number
  shopifyQuantity: number
  localQuantity: number
  inSync: boolean
  lastSyncedAt: Date
}

// ============================================================================
// Add Missing SKU Input
// ============================================================================

export interface AddMissingSkuInput {
  missingSkuId: string
  categoryId: number
  priceCAD: string
  priceUSD: string
  msrpCAD?: string
  msrpUSD?: string
  description?: string
  fabricContent?: string
  skuColor?: string
}

// ============================================================================
// Order Status Sync
// ============================================================================

export interface SyncOrderStatusResult {
  success: boolean
  orderId: string
  shopifyOrderId?: string
  fulfillmentStatus?: string | null
  financialStatus?: string | null
  error?: string
}

export interface BulkSyncResult {
  success: boolean
  synced: number
  failed: number
  errors: Array<{ orderId: string; error: string }>
}

// ============================================================================
// Batch Validation (for Bulk Transfer Customer Name Check)
// ============================================================================

export interface BatchValidationResult {
  results: Array<{
    orderId: string
    orderNumber: string
    customerNameStatus: ShopifyValidationResult['customerNameStatus']
    error?: string
  }>
  hasDiscrepancies: boolean
  discrepancyOrderIds: string[]
  discrepancyOrders: Array<{
    orderId: string
    orderNumber: string
    ohnName: string
    shopifyName: string | null
  }>
}
