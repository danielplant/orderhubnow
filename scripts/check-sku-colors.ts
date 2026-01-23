import { prisma } from '../src/lib/prisma'

async function main() {
  const missing = await prisma.sku.count({
    where: { OR: [{ SkuColor: null }, { SkuColor: '' }] }
  })
  const total = await prisma.sku.count()
  console.log(`SKUs missing color: ${missing} / ${total} (${((missing/total)*100).toFixed(1)}%)`)

  // Show some examples
  if (missing > 0) {
    const examples = await prisma.sku.findMany({
      where: { OR: [{ SkuColor: null }, { SkuColor: '' }] },
      select: { SkuID: true, SkuColor: true, Description: true },
      take: 10,
      orderBy: { DateModified: 'desc' }
    })
    console.log('\nExamples of SKUs missing color:')
    examples.forEach(s => console.log(`  ${s.SkuID} - ${s.Description?.slice(0, 50)}`))
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
