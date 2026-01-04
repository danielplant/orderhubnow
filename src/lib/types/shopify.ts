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
  customerCreated?: boolean
  error?: string
  errors?: string[]
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
