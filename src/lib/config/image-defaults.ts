/**
 * Hardcoded default image configurations.
 * Used as fallback if API fails or config is missing.
 *
 * These match current hardcoded behavior in components.
 */

import type { SkuImageConfig, ImageLocationId } from '@/lib/types/image-config'

/**
 * Default configurations matching current hardcoded behavior
 */
export const IMAGE_CONFIG_DEFAULTS: Record<ImageLocationId, SkuImageConfig> = {
  admin_products_table: {
    id: 'admin_products_table',
    description: 'Admin products table image cell (96x96px)',
    pixelSize: 240,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 100,
  },
  admin_product_modal: {
    id: 'admin_product_modal',
    description: 'Admin product detail modal image',
    pixelSize: 480,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 110,
  },
  admin_collection_card: {
    id: 'admin_collection_card',
    description: 'Admin collection management card',
    pixelSize: 240,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 120,
  },
  buyer_product_thumbnail: {
    id: 'buyer_product_thumbnail',
    description: 'Buyer product card thumbnail with srcSet',
    pixelSize: null,
    useSrcSet: true,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 200,
  },
  buyer_product_lightbox: {
    id: 'buyer_product_lightbox',
    description: 'Buyer product lightbox (full size)',
    pixelSize: 720,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 210,
  },
  buyer_collection_card: {
    id: 'buyer_collection_card',
    description: 'Buyer collection card image',
    pixelSize: 240,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 220,
  },
  export_excel: {
    id: 'export_excel',
    description: 'Excel export embedded images',
    pixelSize: 120,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 300,
  },
  export_pdf: {
    id: 'export_pdf',
    description: 'PDF export embedded images',
    pixelSize: 120,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 310,
  },
}

/**
 * Get a default config for a location ID
 */
export function getDefaultConfig(locationId: string): SkuImageConfig {
  const config = IMAGE_CONFIG_DEFAULTS[locationId as ImageLocationId]
  if (config) return config

  // Generic fallback for unknown locations
  return {
    id: locationId,
    description: 'Unknown location',
    pixelSize: 240,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    enabled: true,
    sortOrder: 999,
  }
}
