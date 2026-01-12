/**
 * Run Collections Migration
 * Creates Collection and ShopifyValueMapping tables
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function runMigration() {
  console.log('Starting Collections migration...\n')

  try {
    // 1. Create Collection table
    console.log('1. Creating Collection table...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Collection') AND type = 'U')
      BEGIN
        CREATE TABLE [dbo].[Collection] (
          [ID] INT IDENTITY(1,1) NOT NULL,
          [Name] NVARCHAR(500) NOT NULL,
          [Type] NVARCHAR(20) NOT NULL,
          [SortOrder] INT NOT NULL DEFAULT 0,
          [ImageUrl] NVARCHAR(500) NULL,
          [ShipWindowStart] DATETIME NULL,
          [ShipWindowEnd] DATETIME NULL,
          [IsActive] BIT NOT NULL DEFAULT 1,
          [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT [PK_Collection] PRIMARY KEY CLUSTERED ([ID])
        )
      END
    `)
    console.log('   ✓ Collection table ready\n')

    // 2. Create indexes on Collection
    console.log('2. Creating indexes on Collection...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Collection_Type' AND object_id = OBJECT_ID('dbo.Collection'))
        CREATE INDEX [IX_Collection_Type] ON [dbo].[Collection]([Type])
    `)
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Collection_SortOrder' AND object_id = OBJECT_ID('dbo.Collection'))
        CREATE INDEX [IX_Collection_SortOrder] ON [dbo].[Collection]([SortOrder])
    `)
    console.log('   ✓ Collection indexes ready\n')

    // 3. Create ShopifyValueMapping table
    console.log('3. Creating ShopifyValueMapping table...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.ShopifyValueMapping') AND type = 'U')
      BEGIN
        CREATE TABLE [dbo].[ShopifyValueMapping] (
          [ID] INT IDENTITY(1,1) NOT NULL,
          [RawValue] NVARCHAR(1000) NOT NULL,
          [CollectionID] INT NULL,
          [Status] NVARCHAR(20) NOT NULL DEFAULT 'unmapped',
          [Note] NVARCHAR(500) NULL,
          [SkuCount] INT NOT NULL DEFAULT 0,
          [FirstSeenAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [LastSeenAt] DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT [PK_ShopifyValueMapping] PRIMARY KEY CLUSTERED ([ID]),
          CONSTRAINT [UQ_ShopifyValueMapping_RawValue] UNIQUE ([RawValue])
        )
      END
    `)
    console.log('   ✓ ShopifyValueMapping table ready\n')

    // 4. Add FK constraint (only if table was just created)
    console.log('4. Adding foreign key constraint...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ShopifyValueMapping_Collection')
        ALTER TABLE [dbo].[ShopifyValueMapping]
        ADD CONSTRAINT [FK_ShopifyValueMapping_Collection] FOREIGN KEY ([CollectionID])
          REFERENCES [dbo].[Collection]([ID]) ON UPDATE NO ACTION ON DELETE NO ACTION
    `)
    console.log('   ✓ Foreign key ready\n')

    // 5. Create indexes on ShopifyValueMapping
    console.log('5. Creating indexes on ShopifyValueMapping...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ShopifyValueMapping_CollectionID' AND object_id = OBJECT_ID('dbo.ShopifyValueMapping'))
        CREATE INDEX [IX_ShopifyValueMapping_CollectionID] ON [dbo].[ShopifyValueMapping]([CollectionID])
    `)
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ShopifyValueMapping_Status' AND object_id = OBJECT_ID('dbo.ShopifyValueMapping'))
        CREATE INDEX [IX_ShopifyValueMapping_Status] ON [dbo].[ShopifyValueMapping]([Status])
    `)
    console.log('   ✓ ShopifyValueMapping indexes ready\n')

    // 6. Add CollectionID column to Sku table
    console.log('6. Adding CollectionID column to Sku table...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sku') AND name = 'CollectionID')
        ALTER TABLE [dbo].[Sku] ADD [CollectionID] INT NULL
    `)
    console.log('   ✓ CollectionID column ready\n')

    // 7. Add FK constraint for Sku.CollectionID
    console.log('7. Adding foreign key for Sku.CollectionID...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Sku_Collection')
        ALTER TABLE [dbo].[Sku]
        ADD CONSTRAINT [FK_Sku_Collection] FOREIGN KEY ([CollectionID])
          REFERENCES [dbo].[Collection]([ID]) ON UPDATE NO ACTION ON DELETE NO ACTION
    `)
    console.log('   ✓ Foreign key ready\n')

    // 8. Create index on Sku.CollectionID
    console.log('8. Creating index on Sku.CollectionID...')
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sku_CollectionID' AND object_id = OBJECT_ID('dbo.Sku'))
        CREATE INDEX [IX_Sku_CollectionID] ON [dbo].[Sku]([CollectionID])
    `)
    console.log('   ✓ Index ready\n')

    console.log('═══════════════════════════════════════════')
    console.log('✓ Migration complete! Tables created:')
    console.log('  - Collection')
    console.log('  - ShopifyValueMapping')
    console.log('  - Sku.CollectionID column added')
    console.log('═══════════════════════════════════════════\n')

  } catch (error) {
    console.error('Migration failed:', error.message)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

runMigration()
