/**
 * Tests schema introspection functionality for Phase 3
 * 
 * Run: npx tsx scripts/test-introspection.ts
 */

import { prisma } from '../src/lib/prisma'
import { shopifyGraphQLFetch } from '../src/lib/shopify/client'

async function testIntrospection() {
  console.log('=== Phase 3: Schema Introspection Test ===\n')
  
  try {
    // 1. Query Shopify for metafield definitions
    const query = `{
      metafieldDefinitions(ownerType: PRODUCT, first: 100) {
        edges {
          node { namespace key name }
        }
      }
    }`
    
    console.log('Querying Shopify for Product metafields...')
    const result = await shopifyGraphQLFetch(query)
    
    if (result.error) {
      console.error('❌ Shopify query failed:', result.error)
      process.exit(1)
    }
    
    // Type the response
    type MetafieldResponse = {
      data?: {
        metafieldDefinitions?: {
          edges?: Array<{ node: { namespace: string; key: string; name: string } }>
        }
      }
    }
    const data = result.data as MetafieldResponse | undefined
    const metafields = data?.data?.metafieldDefinitions?.edges || []
    console.log(`Found ${metafields.length} metafield definitions\n`)
    
    // 2. List first 5 for verification
    console.log('First 5 metafields:')
    for (const edge of metafields.slice(0, 5)) {
      const mf = edge.node
      console.log(`  - ${mf.namespace}:${mf.key} (${mf.name || 'no name'})`)
    }
    
    // 3. Check what we have in database
    const dbMetafields = await prisma.shopifyFieldMapping.count({
      where: { serviceName: 'bulk_sync', fieldType: 'metafield' },
    })
    console.log(`\nDatabase has ${dbMetafields} metafield mappings for bulk_sync`)
    
    // 4. Check for any with accessStatus='removed'
    const removed = await prisma.shopifyFieldMapping.findMany({
      where: { serviceName: 'bulk_sync', accessStatus: 'removed' },
      select: { fieldPath: true, metafieldKey: true },
    })
    if (removed.length > 0) {
      console.log(`\n⚠️  Found ${removed.length} mappings marked as removed:`)
      for (const r of removed) {
        console.log(`  - ${r.fieldPath} (${r.metafieldKey})`)
      }
    }
    
    console.log('\n✅ Introspection test completed')
    
  } finally {
    await prisma.$disconnect()
  }
}

testIntrospection().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
