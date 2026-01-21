/**
 * Seed Script: Initialize Sync Configuration
 *
 * Sets up:
 * 1. Status cascade config (ingestionAllowed, skuAllowed, transferAllowed)
 * 2. Protected fields: Fields that cannot be disabled in the UI
 *
 * Usage: npx tsx scripts/seed-sync-config.ts
 *
 * Safe to run multiple times - uses upsert operations.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Protected fields per entity type
const PROTECTED_FIELDS: Record<string, Array<{ fieldPath: string; fieldType: string; category: string; description: string }>> = {
  Product: [
    { fieldPath: 'id', fieldType: 'ID', category: 'system', description: 'Unique product identifier' },
    { fieldPath: 'status', fieldType: 'ENUM', category: 'enum', description: 'Product status (ACTIVE, DRAFT, ARCHIVED)' },
    { fieldPath: 'handle', fieldType: 'String', category: 'system', description: 'URL-safe product handle' },
  ],
  ProductVariant: [
    { fieldPath: 'id', fieldType: 'ID', category: 'system', description: 'Unique variant identifier' },
    { fieldPath: 'sku', fieldType: 'String', category: 'system', description: 'Stock keeping unit' },
    { fieldPath: 'price', fieldType: 'Money', category: 'scalar', description: 'Variant price' },
    { fieldPath: 'inventoryQuantity', fieldType: 'Int', category: 'scalar', description: 'Current inventory level' },
  ],
}

// Default status cascade config
const DEFAULT_CASCADE_CONFIG = {
  ingestionAllowed: ['ACTIVE', 'DRAFT', 'ARCHIVED'], // Ingest all statuses by default
  skuAllowed: ['ACTIVE'], // Only ACTIVE becomes SKUs
  transferAllowed: ['ACTIVE'], // Only ACTIVE can be transferred
}

async function seedProtectedFields() {
  console.log('\n1. Seeding protected fields...')

  for (const [entityType, fields] of Object.entries(PROTECTED_FIELDS)) {
    for (const field of fields) {
      await prisma.syncFieldConfig.upsert({
        where: {
          entityType_fieldPath: {
            entityType,
            fieldPath: field.fieldPath,
          },
        },
        update: {
          isProtected: true,
          enabled: true, // Protected fields are always enabled
          fieldType: field.fieldType,
          category: field.category,
          description: field.description,
        },
        create: {
          entityType,
          fieldPath: field.fieldPath,
          fieldType: field.fieldType,
          category: field.category,
          description: field.description,
          enabled: true,
          isProtected: true,
          displayOrder: 0,
        },
      })
      console.log(`   ✓ ${entityType}.${field.fieldPath} (protected)`)
    }
  }
}

async function seedStatusCascadeConfig(entityType: string) {
  console.log(`\n2. Seeding status cascade config for ${entityType}...`)

  const keys = ['ingestionAllowed', 'skuAllowed', 'transferAllowed'] as const

  for (const key of keys) {
    const existing = await prisma.syncRuntimeConfig.findUnique({
      where: {
        entityType_configKey: {
          entityType,
          configKey: key,
        },
      },
    })

    if (existing) {
      console.log(`   - ${entityType}.${key} already exists, skipping`)
      continue
    }

    await prisma.syncRuntimeConfig.create({
      data: {
        entityType,
        configKey: key,
        configValue: JSON.stringify(DEFAULT_CASCADE_CONFIG[key]),
        enabled: true,
      },
    })
    console.log(`   ✓ ${entityType}.${key} = ${JSON.stringify(DEFAULT_CASCADE_CONFIG[key])}`)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('Sync Configuration Seed Script')
  console.log('='.repeat(60))

  try {
    await seedProtectedFields()
    await seedStatusCascadeConfig('Product')
    await seedStatusCascadeConfig('ProductVariant')

    // Summary
    console.log('\n3. Verification...')

    const protectedCount = await prisma.syncFieldConfig.count({
      where: { isProtected: true },
    })
    console.log(`   Total protected fields: ${protectedCount}`)

    // Show cascade config
    const cascadeConfigs = await prisma.syncRuntimeConfig.findMany({
      where: {
        configKey: { in: ['ingestionAllowed', 'skuAllowed', 'transferAllowed'] },
      },
      orderBy: [{ entityType: 'asc' }, { configKey: 'asc' }],
    })

    if (cascadeConfigs.length > 0) {
      console.log('\n   Status Cascade Config:')
      for (const c of cascadeConfigs) {
        console.log(`   - ${c.entityType}.${c.configKey} = ${c.configValue}`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('Seed complete!')
    console.log('='.repeat(60))
    console.log('\nThe status cascade config is now set up.')
    console.log('- Ingestion: all statuses are ingested into RawSkusFromShopify')
    console.log('- SKU: only ACTIVE products become SKUs')
    console.log('- Transfer: only ACTIVE SKUs can be transferred to Shopify')
  } catch (error) {
    console.error('\nSeed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
