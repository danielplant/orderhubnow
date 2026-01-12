/**
 * Run Transform: RawSkusFromShopify → Sku table
 * This populates CollectionID based on ShopifyValueMapping
 */

// Import the transform function
const path = require('path')

// We need to use tsx to run TypeScript
const { execSync } = require('child_process')

// Create a small TypeScript script to run the transform
const script = `
import { transformToSkuTable } from './src/lib/shopify/sync'

async function main() {
  console.log('Running transform to populate Sku.CollectionID...')
  const result = await transformToSkuTable({ skipBackup: true })
  console.log('')
  console.log('Transform complete:')
  console.log('  SKUs created:', result.processed)
  console.log('  Skipped:', result.skipped)
  console.log('  Unmapped values:', result.unmappedValues)
}

main().catch(console.error)
`

require('fs').writeFileSync('/tmp/run-transform.ts', script)

try {
  execSync('npx tsx /tmp/run-transform.ts', {
    stdio: 'inherit',
    cwd: '/Users/danielplant/orderhubnow/repo'
  })
} catch (e) {
  process.exit(1)
}
