/**
 * Collection types for the Collections Admin system
 */

export type CollectionType = 'preorder_no_po' | 'preorder_po' | 'ats'

export interface Collection {
  id: number
  name: string
  type: CollectionType
  sortOrder: number
  imageUrl: string | null
  shipWindowStart: string | null // ISO date string
  shipWindowEnd: string | null   // ISO date string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CollectionWithCount extends Collection {
  skuCount: number
}

export interface CollectionFormData {
  name: string
  type: CollectionType
  shipWindowStart?: string | null
  shipWindowEnd?: string | null
}

// Shopify Value Mapping types
export type MappingStatus = 'mapped' | 'unmapped' | 'deferred'

export interface ShopifyValueMapping {
  id: number
  rawValue: string
  collectionId: number | null
  status: MappingStatus
  note: string | null
  skuCount: number
  firstSeenAt: string
  lastSeenAt: string
}

export interface ShopifyValueMappingWithCollection extends ShopifyValueMapping {
  collection: Collection | null
}

export interface MappingStats {
  total: number
  mapped: number
  unmapped: number
  deferred: number
  unmappedSkuCount: number
}

// API response types
export interface CollectionsGrouped {
  preorderNoPo: CollectionWithCount[]
  preorderPo: CollectionWithCount[]
  ats: CollectionWithCount[]
}

export interface ReorderCollectionsRequest {
  type: CollectionType
  orderedIds: number[]
}

export interface MapValueRequest {
  collectionId: number
}

export interface DeferValueRequest {
  note: string
}
