#!/usr/bin/env node
/**
 * Add Shopify Status Columns Migration
 *
 * Adds columns to CustomerOrders for syncing order status from Shopify:
 * - ShopifyFulfillmentStatus: 'unfulfilled', 'partial', 'fulfilled'
 * - ShopifyFinancialStatus: 'pending', 'paid', 'refunded', etc.
 * - ShopifyStatusSyncedAt: Timestamp of last sync
 *
 * Usage: node scripts/add-shopify-status-columns.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function runMigration() {
  console.log('Starting Shopify Status Columns migration...')
  console.log('Database:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'configured')

  try {
    // 1. Add ShopifyFulfillmentStatus column
    console.log('\n1. Adding ShopifyFulfillmentStatus column to CustomerOrders...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CustomerOrders') AND name = 'ShopifyFulfillmentStatus')
      BEGIN
        ALTER TABLE [dbo].[CustomerOrders] ADD [ShopifyFulfillmentStatus] NVARCHAR(20) NULL
      END
    `)
    console.log('   Done.')

    // 2. Add ShopifyFinancialStatus column
    console.log('\n2. Adding ShopifyFinancialStatus column to CustomerOrders...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CustomerOrders') AND name = 'ShopifyFinancialStatus')
      BEGIN
        ALTER TABLE [dbo].[CustomerOrders] ADD [ShopifyFinancialStatus] NVARCHAR(20) NULL
      END
    `)
    console.log('   Done.')

    // 3. Add ShopifyStatusSyncedAt column
    console.log('\n3. Adding ShopifyStatusSyncedAt column to CustomerOrders...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CustomerOrders') AND name = 'ShopifyStatusSyncedAt')
      BEGIN
        ALTER TABLE [dbo].[CustomerOrders] ADD [ShopifyStatusSyncedAt] DATETIME NULL
      END
    `)
    console.log('   Done.')

    // Verify columns were created
    console.log('\n--- Verification ---')
    const columns = await prisma.$queryRaw`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CustomerOrders'
        AND COLUMN_NAME IN ('ShopifyFulfillmentStatus', 'ShopifyFinancialStatus', 'ShopifyStatusSyncedAt')
    `
    console.log('Added columns:', columns.map(c => c.COLUMN_NAME).join(', '))

    console.log('\n✅ Migration completed successfully!')

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runMigration()
