#!/usr/bin/env node
/**
 * Run ProductType Migration
 *
 * Adds ProductType column to RawSkusFromShopify and Sku tables.
 * Run this on EC2 where DATABASE_URL is configured.
 *
 * Usage: node scripts/run-product-type-migration.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function runMigration() {
  console.log('Starting ProductType migration...')
  console.log('Database:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'configured')

  try {
    // 1. Add ProductType column to RawSkusFromShopify
    console.log('\n1. Adding ProductType column to RawSkusFromShopify...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RawSkusFromShopify') AND name = 'ProductType')
      BEGIN
        ALTER TABLE [dbo].[RawSkusFromShopify] ADD [ProductType] NVARCHAR(200) NULL
      END
    `)
    console.log('   Done.')

    // 2. Add ProductType column to Sku
    console.log('\n2. Adding ProductType column to Sku...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sku') AND name = 'ProductType')
      BEGIN
        ALTER TABLE [dbo].[Sku] ADD [ProductType] NVARCHAR(200) NULL
      END
    `)
    console.log('   Done.')

    // Verify columns were created
    console.log('\n--- Verification ---')
    const columns = await prisma.$queryRaw`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME = 'ProductType'
        AND TABLE_NAME IN ('RawSkusFromShopify', 'Sku')
    `
    console.log('ProductType columns found in:', columns.map(c => c.TABLE_NAME).join(', '))

    console.log('\n✅ Migration completed successfully!')
    console.log('\nNext step: Run a Shopify sync to populate ProductType data.')

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runMigration()
