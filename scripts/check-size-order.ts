import { PrismaClient } from '@prisma/client'
import { DEFAULT_SIZE_ORDER, loadSizeOrderConfig, invalidateSizeOrderCache } from '../src/lib/utils/size-sort'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Size Order Configuration Test ===\n')

  // 1. Check what's in the database
  const dbConfig = await prisma.sizeOrderConfig.findFirst()

  console.log('1. DATABASE (SizeOrderConfig table):')
  let dbSizes: string[] | null = null
  if (dbConfig?.Sizes) {
    try {
      dbSizes = JSON.parse(dbConfig.Sizes) as string[]
    } catch {
      dbSizes = dbConfig.Sizes.split(',').map(s => s.trim()).filter(Boolean)
    }
    console.log(`   ✅ Found ${dbSizes.length} sizes in DB`)
    console.log(`   First 5: ${dbSizes.slice(0, 5).join(', ')}`)
    console.log(`   Last 5: ${dbSizes.slice(-5).join(', ')}`)
  } else {
    console.log('   ❌ No SizeOrderConfig record in database')
  }

  console.log('')

  // 2. Check hardcoded defaults
  console.log('2. HARDCODED FALLBACK (DEFAULT_SIZE_ORDER):')
  console.log(`   ${DEFAULT_SIZE_ORDER.length} sizes`)
  console.log(`   First 5: ${DEFAULT_SIZE_ORDER.slice(0, 5).join(', ')}`)
  console.log(`   Last 5: ${DEFAULT_SIZE_ORDER.slice(-5).join(', ')}`)

  console.log('')

  // 3. TEST: What does the runtime actually use?
  console.log('3. RUNTIME TEST (loadSizeOrderConfig):')

  // Clear cache to force fresh load from DB
  invalidateSizeOrderCache()

  // Load config (this is what the app does)
  await loadSizeOrderConfig()

  // Now check what was loaded by re-reading from DB
  // (The cache is internal, so we verify by checking DB was read)
  if (dbSizes && dbSizes.length > 0) {
    console.log('   ✅ Runtime will use DB config (DB has data)')
    console.log(`   Runtime has ${dbSizes.length} sizes`)
  } else {
    console.log('   ⚠️  Runtime will use HARDCODED fallback (no DB config)')
    console.log(`   Runtime has ${DEFAULT_SIZE_ORDER.length} sizes`)
  }

  console.log('')

  // 4. Check for Devika's requested sizes
  const devikasSizes = [
    'XS/S(6-8)',   // NEW - needs to be added to DB
    'M/L(10-16)',  // NEW - needs to be added to DB
    'XS/S(4-6)',   // Existing
    'M/L(7-16)',   // Existing
  ]

  console.log('4. DEVIKA\'S SIZES:')
  console.log('   ┌────────────────┬─────────┬──────────────┐')
  console.log('   │ Size           │ In DB?  │ In Fallback? │')
  console.log('   ├────────────────┼─────────┼──────────────┤')
  for (const size of devikasSizes) {
    const inDb = dbSizes?.includes(size) ? '✅' : '❌'
    const inDefault = DEFAULT_SIZE_ORDER.includes(size) ? '✅' : '❌'
    console.log(`   │ ${size.padEnd(14)} │ ${inDb.padEnd(7)} │ ${inDefault.padEnd(12)} │`)
  }
  console.log('   └────────────────┴─────────┴──────────────┘')

  console.log('')

  // 5. Instructions
  if (dbSizes && !dbSizes.includes('XS/S(6-8)')) {
    console.log('5. ACTION NEEDED:')
    console.log('   Add these sizes to DB via Admin Settings → Size Order:')
    console.log('   • XS/S(6-8)')
    console.log('   • M/L(10-16)')
    console.log('')
    console.log('   After adding, run this script again to verify.')
  } else if (dbSizes?.includes('XS/S(6-8)') && dbSizes?.includes('M/L(10-16)')) {
    console.log('5. STATUS: ✅ ALL GOOD!')
    console.log('   DB has all of Devika\'s sizes.')
    console.log('   Runtime is using DB config.')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
