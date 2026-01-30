/**
 * Tests field toggling functionality for Phase 3
 * 
 * Run: npx tsx scripts/test-field-toggle.ts
 */

import { prisma } from '../src/lib/prisma'
import { generateQueryFromConfig } from '../src/lib/shopify/query-generator'

async function testFieldToggle() {
  console.log('=== Phase 3: Field Toggle Test ===\n')
  
  try {
    // 1. Get a metafield that's currently enabled
    const metafield = await prisma.shopifyFieldMapping.findFirst({
      where: { serviceName: 'bulk_sync', fieldType: 'metafield', enabled: true },
    })
    
    if (!metafield) {
      console.error('No enabled metafield found')
      process.exit(1)
    }
    
    console.log(`Testing with: ${metafield.fieldPath}`)
    
    // 2. Generate query with all metafields
    const query1 = await generateQueryFromConfig('bulk_sync')
    const count1 = (query1.match(/metafield\(/g) || []).length
    console.log(`Before toggle: ${count1} metafields`)
    
    // 3. Disable the metafield
    await prisma.shopifyFieldMapping.update({
      where: { id: metafield.id },
      data: { enabled: false },
    })
    
    // 4. Generate query again - should have one fewer metafield
    const query2 = await generateQueryFromConfig('bulk_sync')
    const count2 = (query2.match(/metafield\(/g) || []).length
    console.log(`After toggle: ${count2} metafields`)
    
    // 5. Restore original state
    await prisma.shopifyFieldMapping.update({
      where: { id: metafield.id },
      data: { enabled: true },
    })
    
    // 6. Verify
    if (count2 === count1 - 1) {
      console.log('\n✅ Field toggle works correctly')
    } else {
      console.error(`\n❌ Expected ${count1 - 1} metafields, got ${count2}`)
      process.exit(1)
    }
    
  } finally {
    await prisma.$disconnect()
  }
}

testFieldToggle().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
