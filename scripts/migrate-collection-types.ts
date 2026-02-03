/**
 * One-time migration script to update Collection.type values
 * from 'ATS'/'PreOrder' to 'ats'/'preorder_no_po'/'preorder_po'
 *
 * Run with: npx tsx scripts/migrate-collection-types.ts
 */

import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('Starting collection type migration...\n')

  // Check current state
  const before = await prisma.collection.groupBy({
    by: ['type'],
    _count: true,
  })
  console.log('Current state:')
  before.forEach((row) => console.log(`  ${row.type}: ${row._count}`))
  console.log('')

  // Update ATS -> ats
  const atsResult = await prisma.collection.updateMany({
    where: { type: 'ATS' },
    data: { type: 'ats' },
  })
  console.log(`Updated ${atsResult.count} ATS -> ats`)

  // Update PreOrder -> preorder_no_po
  const preorderResult = await prisma.collection.updateMany({
    where: { type: 'PreOrder' },
    data: { type: 'preorder_no_po' },
  })
  console.log(`Updated ${preorderResult.count} PreOrder -> preorder_no_po`)

  // Verify final state
  const after = await prisma.collection.groupBy({
    by: ['type'],
    _count: true,
  })
  console.log('\nFinal state:')
  after.forEach((row) => console.log(`  ${row.type}: ${row._count}`))

  console.log('\nMigration complete!')
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
