/**
 * Run Transform: RawSkusFromShopify → Sku table
 * This populates CollectionID based on ShopifyValueMapping
 */

import { transformToSkuTable } from '../src/lib/shopify/sync'

async function main() {
  console.log('Running transform to populate Sku.CollectionID...\n')
  const result = await transformToSkuTable({ skipBackup: true })
  console.log('')
  console.log('═══════════════════════════════════════════')
  console.log('Transform complete:')
  console.log('  SKUs created:', result.processed)
  console.log('  Skipped:', result.skipped)
  console.log('  Unmapped values:', result.unmappedValues)
  console.log('═══════════════════════════════════════════')
}

main().catch(console.error).finally(() => process.exit(0))
