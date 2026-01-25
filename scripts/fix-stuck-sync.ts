#!/usr/bin/env npx tsx
/**
 * Emergency script to fix stuck Shopify sync
 *
 * Usage: npx tsx scripts/fix-stuck-sync.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Fix Stuck Sync ===\n')

  // 1. Find stuck sync runs
  const stuckRuns = await prisma.shopifySyncRun.findMany({
    where: { Status: 'started' },
    orderBy: { StartedAt: 'desc' },
  })

  console.log(`Found ${stuckRuns.length} stuck sync run(s):\n`)

  for (const run of stuckRuns) {
    const duration = Date.now() - run.StartedAt.getTime()
    const durationMins = Math.round(duration / 60000)

    console.log(`  ID: ${run.ID}`)
    console.log(`  Started: ${run.StartedAt.toISOString()}`)
    console.log(`  Duration: ${durationMins} minutes`)
    console.log(`  Operation ID: ${run.OperationId || 'none'}`)
    console.log(`  Current Step: ${run.CurrentStep || 'unknown'}`)
    console.log('')
  }

  if (stuckRuns.length === 0) {
    console.log('No stuck syncs found!')
    return
  }

  // 2. Mark all stuck runs as timeout
  console.log('Marking stuck runs as timeout...')

  const result = await prisma.shopifySyncRun.updateMany({
    where: { Status: 'started' },
    data: {
      Status: 'timeout',
      CompletedAt: new Date(),
      ErrorMessage: 'Manually cleaned up - sync process died',
    },
  })

  console.log(`Updated ${result.count} run(s) to 'timeout' status`)

  // 3. Try to cancel Shopify bulk operation
  const operationIds = stuckRuns
    .map(r => r.OperationId)
    .filter(Boolean)

  if (operationIds.length > 0) {
    console.log('\n--- Shopify Bulk Operation Cleanup ---')
    console.log('Run this curl command to cancel any running Shopify operations:\n')

    console.log(`curl -X POST \\
  "https://\${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json" \\
  -H "Content-Type: application/json" \\
  -H "X-Shopify-Access-Token: \${SHOPIFY_ACCESS_TOKEN}" \\
  -d '{"query": "mutation { bulkOperationCancel { bulkOperation { id status } userErrors { field message } } }"}'
`)
  }

  console.log('\n=== Done ===')
  console.log('You can now start a new sync from the dashboard.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
