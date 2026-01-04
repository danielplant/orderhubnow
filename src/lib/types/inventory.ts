/**
 * Inventory and product domain types.
 */

/**
 * Supported currencies for pricing.
 */
export type Currency = "CAD" | "USD";

/**
 * Category metric for dashboard aggregations.
 */
export interface CategoryMetric {
  name: string;
  count: number;
}

/**
 * Variant availability status for preorder/backorder handling.
 */
export type VariantStatus = 'available' | 'preorder' | 'backorder' | 'discontinued';

/**
 * Product variant with size, availability, and pricing.
 */
export interface ProductVariant {
  size: string;
  sku: string;
  available: number;
  onRoute: number;
  priceCad: number;
  priceUsd: number;
  status?: VariantStatus;
  expectedDate?: string;
}

/**
 * Price tier for bulk/wholesale discounts.
 */
export interface PriceTier {
  minQty: number;
  price: number;
  label?: string;
}

/**
 * Pack size configuration for bulk ordering.
 */
export interface PackSize {
  qty: number;
  label: string;
}

/**
 * Product with metadata and variants.
 */
export interface Product {
  id: string;
  skuBase: string;
  title: string;
  fabric: string;
  color: string;
  priceCad: number;
  priceUsd: number;
  msrpCad: number;
  msrpUsd: number;
  imageUrl: string;
  blurHash?: string;
  variants: ProductVariant[];
  moq?: number;
  moqMessage?: string;
  priceTiers?: PriceTier[];
  packSizes?: PackSize[];
  sizeRun?: Record<string, number>;
  /** Popularity percentile rank (1-100, lower = more popular). Top 10 = Best Seller. */
  popularityRank?: number;
}

/**
 * Dashboard metrics for ATS and PreOrder inventory.
 */
export interface DashboardMetrics {
  ats: {
    total: number;
    categories: CategoryMetric[];
    totalCategories: number;
  };
  preOrder: {
    total: number;
    categories: CategoryMetric[];
    totalCategories: number;
  };
  lastUpdated: string;
}
