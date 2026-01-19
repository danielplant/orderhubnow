/**
 * Seed Script: Initialize Sync Configuration
 *
 * Sets up:
 * 1. Default filter: Product.status = ACTIVE (to exclude DRAFT/ARCHIVED products)
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

// Default filters
const DEFAULT_FILTERS = [
  {
    entityType: 'Product',
    fieldPath: 'status',
    operator: 'in',
    value: '["ACTIVE"]', // JSON array - only sync ACTIVE products
    enabled: true,
  },
]

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

async function seedDefaultFilters() {
  console.log('\n2. Seeding default filters...')

  for (const filter of DEFAULT_FILTERS) {
    const existing = await prisma.syncFilterConfig.findUnique({
      where: {
        entityType_fieldPath: {
          entityType: filter.entityType,
          fieldPath: filter.fieldPath,
        },
      },
    })

    if (existing) {
      console.log(`   - ${filter.entityType}.${filter.fieldPath} already exists, skipping`)
      continue
    }

    await prisma.syncFilterConfig.create({
      data: filter,
    })
    console.log(`   ✓ ${filter.entityType}.${filter.fieldPath} = ${filter.value}`)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('Sync Configuration Seed Script')
  console.log('='.repeat(60))

  try {
    await seedProtectedFields()
    await seedDefaultFilters()

    // Summary
    console.log('\n3. Verification...')

    const protectedCount = await prisma.syncFieldConfig.count({
      where: { isProtected: true },
    })
    console.log(`   Total protected fields: ${protectedCount}`)

    const filterCount = await prisma.syncFilterConfig.count({
      where: { enabled: true },
    })
    console.log(`   Total active filters: ${filterCount}`)

    // Show active filters
    const activeFilters = await prisma.syncFilterConfig.findMany({
      where: { enabled: true },
    })
    if (activeFilters.length > 0) {
      console.log('\n   Active filters:')
      for (const f of activeFilters) {
        console.log(`   - ${f.entityType}.${f.fieldPath} ${f.operator} ${f.value}`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('Seed complete!')
    console.log('='.repeat(60))
    console.log('\nNext step: Run a Shopify sync to apply the filter.')
    console.log('Only ACTIVE products will now be included in the Sku table.')
  } catch (error) {
    console.error('\nSeed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
