/**
 * Create Default ProductVariant → Sku Mapping
 * ============================================================================
 * This script creates a SyncMapping record that replicates the current
 * hardcoded sync behavior in src/lib/shopify/sync.ts.
 *
 * Run with: npx ts-node scripts/create-default-mapping.ts
 *
 * NOTE: This is a placeholder. The full implementation requires:
 * 1. Converting the two-stage sync (Raw → Transform) to a single mapping
 * 2. Encoding the Collection lookup logic as a transform
 * 3. Encoding the unit price calculation as an expression transform
 *
 * The current sync has these stages:
 * 1. Bulk query → RawSkusFromShopify (ingestion)
 * 2. RawSkusFromShopify → Sku (transformation with Collection lookup)
 *
 * Path: scripts/create-default-mapping.ts
 */

import { prisma } from '../src/lib/prisma'

const DEFAULT_MAPPING = {
  name: 'Default Product Sync',
  description: 'Replicates legacy ProductVariant → Sku sync (created by migration)',
  sourceResource: 'ProductVariant',
  targetTable: 'Sku',
  keyMapping: JSON.stringify({
    sourceField: 'sku',
    targetColumn: 'SkuID',
  }),
  mappingsJson: JSON.stringify([
    // Key identifier
    { id: 'sku-id', source: { type: 'single', resource: 'ProductVariant', field: 'sku' }, target: { table: 'Sku', column: 'SkuID' }, enabled: true },

    // Shopify IDs
    { id: 'shopify-variant-id', source: { type: 'single', resource: 'ProductVariant', field: 'id' }, target: { table: 'Sku', column: 'ShopifyProductVariantId' }, transform: { type: 'expression', formula: 'parseShopifyGid(id)' }, enabled: true },

    // Basic fields
    { id: 'display-name', source: { type: 'single', resource: 'ProductVariant', field: 'displayName' }, target: { table: 'Sku', column: 'Description' }, enabled: true },
    { id: 'price', source: { type: 'single', resource: 'ProductVariant', field: 'price' }, target: { table: 'Sku', column: 'Price' }, enabled: true },
    { id: 'quantity', source: { type: 'single', resource: 'ProductVariant', field: 'inventoryQuantity' }, target: { table: 'Sku', column: 'Quantity' }, enabled: true },
    { id: 'size', source: { type: 'single', resource: 'ProductVariant', field: 'selectedOptions.Size' }, target: { table: 'Sku', column: 'Size' }, enabled: true },
    { id: 'product-type', source: { type: 'single', resource: 'ProductVariant', field: 'product.productType' }, target: { table: 'Sku', column: 'ProductType' }, enabled: true },

    // Metafields
    { id: 'fabric', source: { type: 'single', resource: 'ProductVariant', field: 'product.metafields.custom.fabric' }, target: { table: 'Sku', column: 'FabricContent' }, enabled: true },
    { id: 'color', source: { type: 'single', resource: 'ProductVariant', field: 'product.metafields.custom.color' }, target: { table: 'Sku', column: 'SkuColor' }, enabled: true },
    { id: 'order-entry-desc', source: { type: 'single', resource: 'ProductVariant', field: 'product.metafields.custom.order_entry_description' }, target: { table: 'Sku', column: 'OrderEntryDescription' }, enabled: true },

    // Prices from metafields
    { id: 'price-cad', source: { type: 'single', resource: 'ProductVariant', field: 'product.metafields.custom.cad_ws_price' }, target: { table: 'Sku', column: 'PriceCAD' }, enabled: true },
    { id: 'price-usd', source: { type: 'single', resource: 'ProductVariant', field: 'product.metafields.custom.usd_ws_price' }, target: { table: 'Sku', column: 'PriceUSD' }, enabled: true },
    { id: 'msrp-cad', source: { type: 'single', resource: 'ProductVariant', field: 'product.metafields.custom.msrp_cad' }, target: { table: 'Sku', column: 'MSRPCAD' }, enabled: true },
    { id: 'msrp-usd', source: { type: 'single', resource: 'ProductVariant', field: 'product.metafields.custom.msrp_us' }, target: { table: 'Sku', column: 'MSRPUSD' }, enabled: true },

    // Image URL
    { id: 'image-url', source: { type: 'single', resource: 'ProductVariant', field: 'product.featuredMedia.preview.image.url' }, target: { table: 'Sku', column: 'ShopifyImageURL' }, enabled: true },

    // Collection lookup (requires ShopifyValueMapping table)
    { id: 'collection', source: { type: 'single', resource: 'ProductVariant', field: 'product.metafields.custom.order_entry_collection' }, target: { table: 'Sku', column: 'CollectionID' }, transform: { type: 'lookup', table: 'ShopifyValueMapping', matchColumn: 'rawValue', returnColumn: 'collectionId', defaultValue: null }, enabled: true },

    // Unit calculations (from SKU pattern parsing)
    { id: 'units-per-sku', source: { type: 'single', resource: 'ProductVariant', field: 'sku' }, target: { table: 'Sku', column: 'UnitsPerSku' }, transform: { type: 'expression', formula: 'parseUnitsFromSku(sku) || 1' }, enabled: true },
  ]),
  webhookTopics: 'products/update,products/create,products/delete',
  enabled: true,
}

async function createDefaultMapping() {
  console.log('Creating default ProductVariant → Sku mapping...')

  // Check if mapping already exists
  const existing = await prisma.syncMapping.findFirst({
    where: { name: 'Default Product Sync' },
  })

  if (existing) {
    console.log('Default mapping already exists, skipping.')
    return existing
  }

  const mapping = await prisma.syncMapping.create({
    data: DEFAULT_MAPPING,
  })

  console.log(`Created mapping: ${mapping.id} (${mapping.name})`)
  return mapping
}

// Run if executed directly
createDefaultMapping()
  .then(() => {
    console.log('Done.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
