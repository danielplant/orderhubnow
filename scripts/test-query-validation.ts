/**
 * Smoke Test: Phase 1 Query Validation
 *
 * Verifies that:
 * 1. HARDCODE_MODE is true (safe for production)
 * 2. Seed pre-flight validation passes
 * 3. Database has correct field mappings (31 total)
 * 4. Generated query matches hardcoded query exactly
 *
 * Run: npx tsx scripts/test-query-validation.ts
 *
 * Exit codes:
 *   0 = All checks passed
 *   1 = One or more checks failed
 */

import { PrismaClient } from '@prisma/client'
import { validateQueryGeneration } from '../src/lib/shopify/query-generator'
import { validateSeedAgainstQuery } from '../src/lib/shopify/seed-field-mappings'
import { HARDCODE_MODE } from '../src/lib/shopify/sync'

const prisma = new PrismaClient()

// Expected counts from the seed data
const EXPECTED = {
  total: 31,
  bulkSync: 31,
  scalar: 17,
  object: 2,
  connection: 2,
  metafield: 10,
}

async function main() {
  console.log('═'.repeat(60))
  console.log('  Phase 1 Smoke Test: Query Validation')
  console.log('═'.repeat(60))
  console.log()

  const results: Array<{ check: string; passed: boolean; detail: string }> = []

  // ─────────────────────────────────────────────────────────────
  // Check 1: HARDCODE_MODE
  // ─────────────────────────────────────────────────────────────
  console.log('1. HARDCODE_MODE flag')
  const hardcodePassed = HARDCODE_MODE === true
  console.log(`   Value: ${HARDCODE_MODE}`)
  console.log(`   Status: ${hardcodePassed ? '✓ Safe for production' : '✗ DANGER - config-driven mode active'}`)
  results.push({
    check: 'HARDCODE_MODE',
    passed: hardcodePassed,
    detail: `Expected true, got ${HARDCODE_MODE}`,
  })
  console.log()

  // ─────────────────────────────────────────────────────────────
  // Check 2: Seed pre-flight validation
  // ─────────────────────────────────────────────────────────────
  console.log('2. Seed pre-flight validation')
  const seedValidation = validateSeedAgainstQuery()
  console.log(`   Valid: ${seedValidation.valid}`)
  if (!seedValidation.valid) {
    console.log(`   Issues:`)
    for (const issue of seedValidation.issues) {
      console.log(`     - ${issue}`)
    }
  }
  console.log(`   Status: ${seedValidation.valid ? '✓' : '✗'}`)
  results.push({
    check: 'Seed validation',
    passed: seedValidation.valid,
    detail: seedValidation.valid ? 'All fields match' : seedValidation.issues.join('; '),
  })
  console.log()

  // ─────────────────────────────────────────────────────────────
  // Check 3: Database state - field counts
  // ─────────────────────────────────────────────────────────────
  console.log('3. Database field mapping counts')

  const totalMappings = await prisma.shopifyFieldMapping.count()
  const bulkSyncMappings = await prisma.shopifyFieldMapping.count({
    where: { serviceName: 'bulk_sync' },
  })
  const scalarMappings = await prisma.shopifyFieldMapping.count({
    where: { serviceName: 'bulk_sync', fieldType: 'scalar' },
  })
  const objectMappings = await prisma.shopifyFieldMapping.count({
    where: { serviceName: 'bulk_sync', fieldType: 'object' },
  })
  const connectionMappings = await prisma.shopifyFieldMapping.count({
    where: { serviceName: 'bulk_sync', fieldType: 'connection' },
  })
  const metafieldMappings = await prisma.shopifyFieldMapping.count({
    where: { serviceName: 'bulk_sync', fieldType: 'metafield' },
  })

  const counts = [
    { name: 'bulk_sync total', actual: bulkSyncMappings, expected: EXPECTED.bulkSync },
    { name: 'scalar', actual: scalarMappings, expected: EXPECTED.scalar },
    { name: 'object', actual: objectMappings, expected: EXPECTED.object },
    { name: 'connection', actual: connectionMappings, expected: EXPECTED.connection },
    { name: 'metafield', actual: metafieldMappings, expected: EXPECTED.metafield },
  ]

  let allCountsMatch = true
  console.log(`   Total mappings in DB: ${totalMappings}`)
  for (const { name, actual, expected } of counts) {
    const match = actual === expected
    if (!match) allCountsMatch = false
    console.log(`   ${name}: ${actual} ${match ? '✓' : `✗ (expected ${expected})`}`)
  }

  const computedTotal = scalarMappings + objectMappings + connectionMappings + metafieldMappings
  const totalMatch = computedTotal === EXPECTED.total
  if (!totalMatch) allCountsMatch = false
  console.log(`   Computed total: ${computedTotal} ${totalMatch ? '✓' : `✗ (expected ${EXPECTED.total})`}`)

  results.push({
    check: 'Database counts',
    passed: allCountsMatch,
    detail: allCountsMatch
      ? `All counts match (scalar=${scalarMappings}, object=${objectMappings}, connection=${connectionMappings}, metafield=${metafieldMappings})`
      : 'One or more counts mismatch',
  })
  console.log()

  // ─────────────────────────────────────────────────────────────
  // Check 4: Query generation validation
  // ─────────────────────────────────────────────────────────────
  console.log('4. Query generation validation')
  const queryResult = await validateQueryGeneration('bulk_sync')
  console.log(`   Match: ${queryResult.match}`)
  if (!queryResult.match && queryResult.differences.length > 0) {
    console.log(`   First ${Math.min(5, queryResult.differences.length)} differences:`)
    for (const diff of queryResult.differences.slice(0, 5)) {
      console.log(`     ${diff}`)
    }
    if (queryResult.differences.length > 5) {
      console.log(`     ... and ${queryResult.differences.length - 5} more`)
    }
  }
  console.log(`   Status: ${queryResult.match ? '✓ Queries match exactly' : '✗ Queries differ'}`)
  results.push({
    check: 'Query generation',
    passed: queryResult.match,
    detail: queryResult.match ? 'Generated matches hardcoded' : `${queryResult.differences.length} differences`,
  })
  console.log()

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('═'.repeat(60))
  console.log('  Summary')
  console.log('═'.repeat(60))

  for (const r of results) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.check}: ${r.detail.slice(0, 50)}${r.detail.length > 50 ? '...' : ''}`)
  }

  const allPassed = results.every((r) => r.passed)
  console.log()
  console.log('═'.repeat(60))
  console.log(`  Result: ${allPassed ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'}`)
  console.log('═'.repeat(60))

  await prisma.$disconnect()
  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => {
  console.error('\nFatal error:', e)
  process.exit(1)
})
