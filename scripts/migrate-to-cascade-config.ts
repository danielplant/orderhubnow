/**
 * Migration Script: Convert Legacy Runtime Flags to Status Cascade Config
 *
 * This script migrates the old configuration model (syncFilterConfig + runtime flags)
 * to the new unified StatusCascadeConfig model.
 *
 * Old model:
 * - syncFilterConfig: status filter with value like '["ACTIVE"]'
 * - syncRuntimeConfig: ingestionActiveOnly, transferActiveOnly (booleans)
 *
 * New model:
 * - StatusCascadeConfig: ingestionAllowed, skuAllowed, transferAllowed (arrays)
 *
 * Usage: npx tsx scripts/migrate-to-cascade-config.ts
 *
 * Safe to run multiple times - uses upsert operations.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const VALID_STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED']

interface LegacyRuntimeFlags {
  ingestionActiveOnly: boolean
  transferActiveOnly: boolean
}

interface StatusCascadeConfig {
  ingestionAllowed: string[]
  skuAllowed: string[]
  transferAllowed: string[]
}

async function getLegacyConfig(entityType: string): Promise<{
  statusFilter: string[] | null
  runtimeFlags: LegacyRuntimeFlags
}> {
  // Get existing status filter
  const statusFilter = await prisma.syncFilterConfig.findFirst({
    where: { entityType, fieldPath: 'status', enabled: true },
  })

  let parsedStatuses: string[] | null = null
  if (statusFilter) {
    try {
      const parsed = JSON.parse(statusFilter.value)
      parsedStatuses = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      parsedStatuses = [statusFilter.value]
    }
  }

  // Get existing runtime flags
  const runtimeRows = await prisma.syncRuntimeConfig.findMany({
    where: { entityType },
  })

  const runtimeFlags: LegacyRuntimeFlags = {
    ingestionActiveOnly: false,
    transferActiveOnly: false,
  }

  for (const row of runtimeRows) {
    if (row.configKey === 'ingestionActiveOnly') {
      runtimeFlags.ingestionActiveOnly = row.enabled
    }
    if (row.configKey === 'transferActiveOnly') {
      runtimeFlags.transferActiveOnly = row.enabled
    }
  }

  return { statusFilter: parsedStatuses, runtimeFlags }
}

async function migrateEntityType(entityType: string): Promise<void> {
  console.log(`\nMigrating ${entityType}...`)

  const { statusFilter, runtimeFlags } = await getLegacyConfig(entityType)

  // Build new cascade config
  const cascadeConfig: StatusCascadeConfig = {
    // Ingestion: all statuses unless ingestionActiveOnly was true
    ingestionAllowed: runtimeFlags.ingestionActiveOnly
      ? ['ACTIVE']
      : [...VALID_STATUSES],

    // SKU: from existing status filter, or default to ACTIVE
    skuAllowed: statusFilter && statusFilter.length > 0
      ? statusFilter.filter(s => VALID_STATUSES.includes(s))
      : ['ACTIVE'],

    // Transfer: same as SKU unless transferActiveOnly was true
    transferAllowed: runtimeFlags.transferActiveOnly
      ? ['ACTIVE']
      : (statusFilter && statusFilter.length > 0
          ? statusFilter.filter(s => VALID_STATUSES.includes(s))
          : ['ACTIVE']),
  }

  // Ensure cascade constraints are valid
  // skuAllowed must be subset of ingestionAllowed
  cascadeConfig.skuAllowed = cascadeConfig.skuAllowed.filter(
    s => cascadeConfig.ingestionAllowed.includes(s)
  )
  // transferAllowed must be subset of skuAllowed
  cascadeConfig.transferAllowed = cascadeConfig.transferAllowed.filter(
    s => cascadeConfig.skuAllowed.includes(s)
  )

  console.log('  Legacy config:')
  console.log(`    - Status filter: ${statusFilter ? JSON.stringify(statusFilter) : 'none'}`)
  console.log(`    - ingestionActiveOnly: ${runtimeFlags.ingestionActiveOnly}`)
  console.log(`    - transferActiveOnly: ${runtimeFlags.transferActiveOnly}`)
  console.log('  New cascade config:')
  console.log(`    - ingestionAllowed: ${JSON.stringify(cascadeConfig.ingestionAllowed)}`)
  console.log(`    - skuAllowed: ${JSON.stringify(cascadeConfig.skuAllowed)}`)
  console.log(`    - transferAllowed: ${JSON.stringify(cascadeConfig.transferAllowed)}`)

  // Write new cascade config
  const keys = ['ingestionAllowed', 'skuAllowed', 'transferAllowed'] as const

  for (const key of keys) {
    await prisma.syncRuntimeConfig.upsert({
      where: {
        entityType_configKey: {
          entityType,
          configKey: key,
        },
      },
      update: {
        configValue: JSON.stringify(cascadeConfig[key]),
        enabled: true,
        updatedAt: new Date(),
      },
      create: {
        entityType,
        configKey: key,
        configValue: JSON.stringify(cascadeConfig[key]),
        enabled: true,
      },
    })
    console.log(`  ✓ Saved ${key}`)
  }

  console.log(`  Migration complete for ${entityType}`)
}

async function main() {
  console.log('='.repeat(60))
  console.log('Status Cascade Migration Script')
  console.log('='.repeat(60))

  try {
    // Migrate Product entity
    await migrateEntityType('Product')

    // Migrate ProductVariant entity (uses same config)
    await migrateEntityType('ProductVariant')

    console.log('\n' + '='.repeat(60))
    console.log('Migration complete!')
    console.log('='.repeat(60))
    console.log('\nThe new cascade config is now active.')
    console.log('Old runtime flags (ingestionActiveOnly, transferActiveOnly) are no longer used.')
    console.log('The status filter in syncFilterConfig is no longer used for Products.')
  } catch (error) {
    console.error('\nMigration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
