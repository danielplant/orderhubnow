// scripts/check-raw-skus.ts
import { prisma } from '../src/lib/prisma'

async function main() {
  // Total count
  const totalCount = await prisma.rawSkusFromShopify.count()
  console.log(`Total records in RawSkusFromShopify: ${totalCount}`)

  // Count by ProductStatus
  const byStatus = await prisma.rawSkusFromShopify.groupBy({
    by: ['ProductStatus'],
    _count: { ProductStatus: true },
  })
  
  console.log('\nBreakdown by ProductStatus:')
  byStatus.forEach((row) => {
    console.log(`  ${row.ProductStatus ?? 'NULL'}: ${row._count.ProductStatus}`)
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())