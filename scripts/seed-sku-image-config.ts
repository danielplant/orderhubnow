/**
 * Seed Script: Initialize SKU Image Display Configuration
 *
 * Sets up all display locations where SKU images are shown,
 * based on actual code analysis of the codebase.
 *
 * Usage: npx tsx scripts/seed-sku-image-config.ts
 *
 * Safe to run multiple times - uses upsert operations.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Display locations from code analysis (2026-01-23)
 *
 * Each entry maps to an actual image display in the codebase:
 * - id: unique identifier (used for reference)
 * - description: human-readable description
 * - component: source file path
 * - pixelSize: S3 thumbnail size requested (null = uses srcSet)
 * - useSrcSet: whether it uses responsive srcSet
 * - primary: first choice source
 * - fallback: second choice source (null = none)
 * - fallback2: third choice (stored in description for now)
 * - cdnTransform: transformation applied to CDN URLs
 */
const DISPLAY_LOCATIONS = [
  // ==========================================================================
  // BUYER SIDE
  // ==========================================================================
  {
    id: 'buyer_product_thumbnail',
    description: 'Buyer product card - main thumbnail image with srcSet. Fallback chain: S3 srcSet → Shopify CDN (no transform) → SVG placeholder',
    component: 'src/components/buyer/product-order-card.tsx',
    pixelSize: null, // Uses srcSet
    useSrcSet: true,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    cdnTransform: null,
    sortOrder: 1,
  },
  {
    id: 'buyer_product_lightbox',
    description: 'Buyer product card - lightbox/zoom modal. Fallback chain: Shopify CDN fullsize → S3 md → "No image available" text',
    component: 'src/components/buyer/product-order-card.tsx',
    pixelSize: null, // Uses fullsizeUrl (Shopify CDN) or srcSet src
    useSrcSet: false,
    primary: 'shopify_cdn',
    fallback: 's3_thumbnail',
    cdnTransform: null,
    sortOrder: 2,
  },
  {
    id: 'buyer_collection_card',
    description: 'Buyer collection card - background image. No fallback, gradient shown when no image. Source: imageUrl direct',
    component: 'src/components/buyer/collection-card.tsx',
    pixelSize: null,
    useSrcSet: false,
    primary: 'shopify_cdn',
    fallback: null,
    cdnTransform: null,
    sortOrder: 3,
  },
  {
    id: 'buyer_preorder_hero',
    description: 'Pre-order page hero - background image style. Source: imageUrl direct',
    component: 'src/app/buyer/(shop)/pre-order/page.tsx',
    pixelSize: null,
    useSrcSet: false,
    primary: 'shopify_cdn',
    fallback: null,
    cdnTransform: null,
    sortOrder: 4,
  },

  // ==========================================================================
  // ADMIN SIDE
  // ==========================================================================
  {
    id: 'admin_products_table',
    description: 'Admin products table - row thumbnail. Fallback chain: S3 md (240px) → Shopify CDN → SVG placeholder',
    component: 'src/components/admin/products-table.tsx',
    pixelSize: 240,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    cdnTransform: null,
    sortOrder: 10,
  },
  {
    id: 'admin_product_modal',
    description: 'Admin product detail modal - larger image. Fallback chain: S3 lg (480px) → Shopify CDN → SVG placeholder',
    component: 'src/components/admin/product-detail-modal.tsx',
    pixelSize: 480,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    cdnTransform: null,
    sortOrder: 11,
  },
  {
    id: 'admin_category_modal',
    description: 'Admin category image modal - preview. Fallback chain: previewUrl → category.imageUrl → /SkuImages/{id}.jpg → /placeholder.svg',
    component: 'src/components/admin/category-image-modal.tsx',
    pixelSize: null,
    useSrcSet: false,
    primary: 'shopify_cdn',
    fallback: 'static_file',
    cdnTransform: null,
    sortOrder: 12,
  },
  {
    id: 'admin_collection_card',
    description: 'Admin collection card - thumbnail. Fallback chain: collection.imageUrl → /logos/limeapple-logo.png',
    component: 'src/components/admin/collections/collection-card.tsx',
    pixelSize: null,
    useSrcSet: false,
    primary: 'shopify_cdn',
    fallback: 'static_file',
    cdnTransform: null,
    sortOrder: 13,
  },
  {
    id: 'admin_collection_modal',
    description: 'Admin collection modal - image preview',
    component: 'src/components/admin/collections/collection-modal.tsx',
    pixelSize: null,
    useSrcSet: false,
    primary: 'shopify_cdn',
    fallback: null,
    cdnTransform: null,
    sortOrder: 14,
  },

  // ==========================================================================
  // EXPORTS / API
  // ==========================================================================
  {
    id: 'pdf_export',
    description: 'PDF catalog/linesheet exports. Uses S3 sm (120px) for file size, falls back to Shopify CDN',
    component: 'src/lib/utils/pdf-images.ts',
    pixelSize: 120,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    cdnTransform: null,
    sortOrder: 20,
  },
  {
    id: 'excel_export',
    description: 'Excel product exports with embedded images. Uses S3 sm (120px)',
    component: 'src/app/api/products/export/route.ts',
    pixelSize: 120,
    useSrcSet: false,
    primary: 's3_thumbnail',
    fallback: 'shopify_cdn',
    cdnTransform: null,
    sortOrder: 21,
  },
]

async function seedSkuImageConfig() {
  console.log('\nSeeding SKU Image Display Configurations...\n')

  // Delete old configs that no longer exist
  const existingIds = DISPLAY_LOCATIONS.map(c => c.id)
  const deleted = await prisma.skuImageConfig.deleteMany({
    where: { id: { notIn: existingIds } },
  })
  if (deleted.count > 0) {
    console.log(`   Removed ${deleted.count} obsolete config(s)\n`)
  }

  for (const config of DISPLAY_LOCATIONS) {
    await prisma.skuImageConfig.upsert({
      where: { id: config.id },
      update: {
        description: config.description,
        pixelSize: config.pixelSize,
        useSrcSet: config.useSrcSet,
        primary: config.primary,
        fallback: config.fallback,
        sortOrder: config.sortOrder,
        enabled: true,
      },
      create: {
        id: config.id,
        description: config.description,
        pixelSize: config.pixelSize,
        useSrcSet: config.useSrcSet,
        primary: config.primary,
        fallback: config.fallback,
        sortOrder: config.sortOrder,
        enabled: true,
      },
    })
    const sizeLabel = config.useSrcSet ? 'srcSet' : config.pixelSize ? `${config.pixelSize}px` : 'direct'
    console.log(`   ✓ ${config.id.padEnd(25)} ${sizeLabel.padEnd(8)} ${config.primary} → ${config.fallback || 'none'}`)
  }
}

async function main() {
  console.log('='.repeat(70))
  console.log('SKU Image Configuration Seed Script')
  console.log('='.repeat(70))

  try {
    await seedSkuImageConfig()

    // Summary
    console.log('\n' + '-'.repeat(70))
    console.log('Summary')
    console.log('-'.repeat(70))

    const configs = await prisma.skuImageConfig.findMany({
      orderBy: { sortOrder: 'asc' },
    })

    console.log(`\n   Total display locations: ${configs.length}`)

    // Group by area
    const buyerConfigs = configs.filter(c => c.id.startsWith('buyer_'))
    const adminConfigs = configs.filter(c => c.id.startsWith('admin_'))
    const exportConfigs = configs.filter(c => c.id.includes('export'))

    console.log(`   - Buyer UI: ${buyerConfigs.length}`)
    console.log(`   - Admin UI: ${adminConfigs.length}`)
    console.log(`   - Exports:  ${exportConfigs.length}`)

    // Show pixel sizes needed
    const pixelSizes = [...new Set(configs.map(c => c.pixelSize).filter(Boolean))]
    console.log(`\n   Unique S3 pixel sizes needed: ${pixelSizes.sort((a, b) => (a || 0) - (b || 0)).join('px, ')}px`)

    // Show srcSet usage
    const srcSetCount = configs.filter(c => c.useSrcSet).length
    console.log(`   Locations using srcSet: ${srcSetCount}`)

    console.log('\n' + '='.repeat(70))
    console.log('Seed complete!')
    console.log('='.repeat(70))
    console.log('\nView/edit configurations at: Admin > Dev > Shopify > Images')
  } catch (error) {
    console.error('\nSeed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
