/**
 * TypeScript types for the SKU Image Configuration system.
 * These match the SkuImageConfig Prisma model.
 */

/**
 * Image source types that can be configured
 */
export type ImageSource = 's3_thumbnail' | 'shopify_cdn' | 'static_file'

/**
 * Configuration for a single image display location
 */
export interface SkuImageConfig {
  /** Location identifier, e.g., "admin_products_table" */
  id: string
  /** Human-readable description */
  description: string
  /** Target pixel size (null if using srcSet) */
  pixelSize: number | null
  /** Whether to use responsive srcSet */
  useSrcSet: boolean
  /** Primary image source */
  primary: ImageSource
  /** Fallback image source (null for none) */
  fallback: ImageSource | null
  /** Whether this config is enabled */
  enabled: boolean
  /** Sort order for display */
  sortOrder: number
}

/**
 * Resolved image URL result from config
 */
export interface ResolvedImageUrl {
  /** Primary URL to try first */
  primaryUrl: string | null
  /** Fallback URL if primary fails */
  fallbackUrl: string | null
  /** srcSet string if useSrcSet is true */
  srcSet: string | null
  /** The config that was used */
  config: SkuImageConfig
}

/**
 * Location IDs used throughout the application
 */
export type ImageLocationId =
  | 'admin_products_table'
  | 'admin_product_modal'
  | 'admin_collection_card'
  | 'buyer_product_thumbnail'
  | 'buyer_product_lightbox'
  | 'buyer_collection_card'
  | 'export_excel'
  | 'export_pdf'
