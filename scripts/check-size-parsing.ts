import { prisma } from '../src/lib/prisma'

/**
 * Find SKUs where hyphen-based size parsing would fail.
 * These are SKUs where the Size field contains a hyphen (like "M/L(7-16)")
 * which would be incorrectly split by lastIndexOf('-')
 */
async function main() {
  // Find SKUs with hyphens in the Size field
  const problematicSkus = await prisma.sku.findMany({
    where: {
      Size: { contains: '-' }
    },
    select: {
      SkuID: true,
      Size: true,
      CategoryID: true,
    },
    take: 50,
  })

  console.log(`\n=== SKUs with hyphens in Size field ===\n`)
  console.log(`Found ${problematicSkus.length} examples:\n`)

  for (const sku of problematicSkus) {
    const skuId = sku.SkuID
    const actualSize = sku.Size

    // Simulate the broken parsing (lastIndexOf hyphen)
    const lastHyphen = skuId.lastIndexOf('-')
    const parsedSize = lastHyphen > 0 ? skuId.substring(lastHyphen + 1) : 'O/S'

    const isWrong = parsedSize !== actualSize
    const status = isWrong ? '❌ WRONG' : '✅ OK'

    console.log(`${status}  SKU: ${skuId}`)
    console.log(`         Actual Size: "${actualSize}"`)
    console.log(`         Parsed Size: "${parsedSize}"`)
    console.log()
  }

  // Count total affected
  const totalAffected = await prisma.sku.count({
    where: { Size: { contains: '-' } }
  })
  const total = await prisma.sku.count()
  console.log(`\n=== Summary ===`)
  console.log(`SKUs with hyphens in Size: ${totalAffected} / ${total} (${((totalAffected/total)*100).toFixed(1)}%)`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
