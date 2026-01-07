#!/usr/bin/env node
/**
 * Run Shipments Migration
 *
 * This script applies the shipments tables migration using Prisma's $executeRawUnsafe.
 * Run this on EC2 where DATABASE_URL is configured.
 *
 * Usage: node scripts/run-shipments-migration.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function runMigration() {
  console.log('Starting Shipments migration...')
  console.log('Database:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'configured')

  try {
    // 1. Add ShopifyOrderID column to CustomerOrders
    console.log('\n1. Adding ShopifyOrderID column to CustomerOrders...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CustomerOrders') AND name = 'ShopifyOrderID')
      BEGIN
        ALTER TABLE [dbo].[CustomerOrders] ADD [ShopifyOrderID] NVARCHAR(50) NULL
      END
    `)
    console.log('   Done.')

    // 2. Create Shipments table
    console.log('\n2. Creating Shipments table...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Shipments') AND type = 'U')
      BEGIN
        CREATE TABLE [dbo].[Shipments] (
          [ID] BIGINT IDENTITY(1,1) NOT NULL,
          [CustomerOrderID] BIGINT NOT NULL,
          [ShippedSubtotal] FLOAT NOT NULL DEFAULT 0,
          [ShippingCost] FLOAT NOT NULL DEFAULT 0,
          [ShippedTotal] FLOAT NOT NULL DEFAULT 0,
          [ShipDate] DATETIME NULL,
          [InternalNotes] NVARCHAR(MAX) NULL,
          [CreatedBy] NVARCHAR(255) NOT NULL,
          [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [UpdatedAt] DATETIME NULL,
          [ShopifyFulfillmentID] NVARCHAR(50) NULL,
          CONSTRAINT [PK_Shipments] PRIMARY KEY CLUSTERED ([ID]),
          CONSTRAINT [FK_Shipments_CustomerOrders] FOREIGN KEY ([CustomerOrderID])
            REFERENCES [dbo].[CustomerOrders]([ID]) ON UPDATE NO ACTION
        )
      END
    `)
    console.log('   Done.')

    // 3. Create Shipments index
    console.log('\n3. Creating Shipments index...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Shipments_CustomerOrderID' AND object_id = OBJECT_ID('dbo.Shipments'))
      BEGIN
        CREATE INDEX [IX_Shipments_CustomerOrderID] ON [dbo].[Shipments]([CustomerOrderID])
      END
    `)
    console.log('   Done.')

    // 4. Create ShipmentItems table
    console.log('\n4. Creating ShipmentItems table...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.ShipmentItems') AND type = 'U')
      BEGIN
        CREATE TABLE [dbo].[ShipmentItems] (
          [ID] BIGINT IDENTITY(1,1) NOT NULL,
          [ShipmentID] BIGINT NOT NULL,
          [OrderItemID] BIGINT NOT NULL,
          [QuantityShipped] INT NOT NULL,
          [PriceOverride] FLOAT NULL,
          CONSTRAINT [PK_ShipmentItems] PRIMARY KEY CLUSTERED ([ID]),
          CONSTRAINT [FK_ShipmentItems_Shipments] FOREIGN KEY ([ShipmentID])
            REFERENCES [dbo].[Shipments]([ID]) ON UPDATE NO ACTION,
          CONSTRAINT [FK_ShipmentItems_CustomerOrdersItems] FOREIGN KEY ([OrderItemID])
            REFERENCES [dbo].[CustomerOrdersItems]([ID]) ON UPDATE NO ACTION
        )
      END
    `)
    console.log('   Done.')

    // 5. Create ShipmentItems indexes
    console.log('\n5. Creating ShipmentItems indexes...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ShipmentItems_ShipmentID' AND object_id = OBJECT_ID('dbo.ShipmentItems'))
      BEGIN
        CREATE INDEX [IX_ShipmentItems_ShipmentID] ON [dbo].[ShipmentItems]([ShipmentID])
      END
    `)
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ShipmentItems_OrderItemID' AND object_id = OBJECT_ID('dbo.ShipmentItems'))
      BEGIN
        CREATE INDEX [IX_ShipmentItems_OrderItemID] ON [dbo].[ShipmentItems]([OrderItemID])
      END
    `)
    console.log('   Done.')

    // 6. Create ShipmentTracking table
    console.log('\n6. Creating ShipmentTracking table...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.ShipmentTracking') AND type = 'U')
      BEGIN
        CREATE TABLE [dbo].[ShipmentTracking] (
          [ID] BIGINT IDENTITY(1,1) NOT NULL,
          [ShipmentID] BIGINT NOT NULL,
          [Carrier] NVARCHAR(50) NOT NULL,
          [TrackingNumber] NVARCHAR(100) NOT NULL,
          [AddedAt] DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT [PK_ShipmentTracking] PRIMARY KEY CLUSTERED ([ID]),
          CONSTRAINT [FK_ShipmentTracking_Shipments] FOREIGN KEY ([ShipmentID])
            REFERENCES [dbo].[Shipments]([ID]) ON UPDATE NO ACTION
        )
      END
    `)
    console.log('   Done.')

    // 7. Create ShipmentTracking index
    console.log('\n7. Creating ShipmentTracking index...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ShipmentTracking_ShipmentID' AND object_id = OBJECT_ID('dbo.ShipmentTracking'))
      BEGIN
        CREATE INDEX [IX_ShipmentTracking_ShipmentID] ON [dbo].[ShipmentTracking]([ShipmentID])
      END
    `)
    console.log('   Done.')

    // 8. Create CustomerOrdersItems index if missing
    console.log('\n8. Creating CustomerOrdersItems index (if needed)...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerOrdersItems_CustomerOrderID' AND object_id = OBJECT_ID('dbo.CustomerOrdersItems'))
      BEGIN
        CREATE INDEX [IX_CustomerOrdersItems_CustomerOrderID] ON [dbo].[CustomerOrdersItems]([CustomerOrderID])
      END
    `)
    console.log('   Done.')

    // Verify tables were created
    console.log('\n--- Verification ---')
    const tables = await prisma.$queryRaw`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME IN ('Shipments', 'ShipmentItems', 'ShipmentTracking')
    `
    console.log('Created tables:', tables.map(t => t.TABLE_NAME).join(', '))

    console.log('\n✅ Migration completed successfully!')

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runMigration()
