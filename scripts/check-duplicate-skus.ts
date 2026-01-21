import { prisma } from '../src/lib/prisma'

async function checkDuplicateSkus() {
  console.log('Checking for duplicate SKUs...\n')

  // Raw SQL to find duplicates
  const duplicates = await prisma.$queryRaw<Array<{ SkuID: string; cnt: bigint }>>`
    SELECT SkuID, COUNT(*) as cnt 
    FROM Sku 
    GROUP BY SkuID 
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `

  if (duplicates.length === 0) {
    console.log('✓ No duplicate SKUs found in the Sku table.')
  } else {
    console.log(`✗ Found ${duplicates.length} duplicate SKU IDs:\n`)
    for (const dup of duplicates.slice(0, 20)) {
      console.log(`  ${dup.SkuID}: ${dup.cnt} occurrences`)
    }
    if (duplicates.length > 20) {
      console.log(`  ... and ${duplicates.length - 20} more`)
    }
  }

  // Also check total row count vs unique count
  const totalCount = await prisma.sku.count()
  const uniqueCount = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(DISTINCT SkuID) as cnt FROM Sku
  `
  
  console.log(`\nTotal rows: ${totalCount}`)
  console.log(`Unique SKU IDs: ${uniqueCount[0].cnt}`)
  console.log(`Potential duplicates: ${totalCount - Number(uniqueCount[0].cnt)}`)

  await prisma.$disconnect()
}

checkDuplicateSkus().catch(console.error)