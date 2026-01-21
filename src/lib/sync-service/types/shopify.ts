/**
 * Shopify Types - Shopify connector interfaces and types
 */

export interface ShopifyConfig {
  storeDomain: string;
  accessToken: string;
  apiVersion: string;
  webhookSecret?: string;
}

export interface ShopifyConnectionTestResult {
  success: boolean;
  message: string;
  shopName?: string;
  shopId?: string;
}

export interface ShopifyField {
  name: string;
  type: string;
  description?: string;
}

export interface ShopifyResource {
  name: string;
  fields: ShopifyField[];
}

export interface MetafieldDefinition {
  namespace: string;
  key: string;
  type: string;
  ownerType: string;
}

export interface ShopifySchema {
  resources: ShopifyResource[];
  metafieldDefinitions: MetafieldDefinition[];
  discoveredAt: string;
}

// All owner types that can have metafields
export const METAFIELD_OWNER_TYPES = [
  'PRODUCT',
  'PRODUCTVARIANT',
  'COLLECTION',
  'CUSTOMER',
  'ORDER',
  'SHOP',
] as const;

export type MetafieldOwnerType = (typeof METAFIELD_OWNER_TYPES)[number];

// Relevant GraphQL types to include in schema discovery
export const RELEVANT_TYPES = [
  'Product',
  'ProductVariant',
  'InventoryLevel',
  'InventoryItem',
  'Collection',
  'Customer',
  'Order',
  'Metafield',
  'Shop',
  'Location',
] as const;
