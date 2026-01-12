-- Migration: Add Collection, ShopifyValueMapping tables, and CollectionID to Sku
-- Feature: Collections Admin Redesign
-- Date: 2026-01-12
--
-- IMPORTANT: Review and run this on the production database
-- Backup the database before running this migration

-- Create Collection table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Collection') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[Collection] (
        [ID] INT IDENTITY(1,1) NOT NULL,
        [Name] NVARCHAR(500) NOT NULL,
        [Type] NVARCHAR(20) NOT NULL,           -- 'ATS' or 'PreOrder'
        [SortOrder] INT NOT NULL DEFAULT 0,
        [ImageUrl] NVARCHAR(500) NULL,
        [ShipWindowStart] DATETIME NULL,
        [ShipWindowEnd] DATETIME NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT [PK_Collection] PRIMARY KEY CLUSTERED ([ID])
    );

    CREATE INDEX [IX_Collection_Type] ON [dbo].[Collection]([Type]);
    CREATE INDEX [IX_Collection_SortOrder] ON [dbo].[Collection]([SortOrder]);
    PRINT 'Created Collection table';
END
GO

-- Create ShopifyValueMapping table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.ShopifyValueMapping') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[ShopifyValueMapping] (
        [ID] INT IDENTITY(1,1) NOT NULL,
        [RawValue] NVARCHAR(1000) NOT NULL,     -- Exact Shopify string, never modified
        [CollectionID] INT NULL,
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'unmapped', -- 'mapped', 'unmapped', 'deferred'
        [Note] NVARCHAR(500) NULL,              -- For deferred items
        [SkuCount] INT NOT NULL DEFAULT 0,      -- Cached count for display
        [FirstSeenAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [LastSeenAt] DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT [PK_ShopifyValueMapping] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [UQ_ShopifyValueMapping_RawValue] UNIQUE ([RawValue]),
        CONSTRAINT [FK_ShopifyValueMapping_Collection] FOREIGN KEY ([CollectionID])
            REFERENCES [dbo].[Collection]([ID]) ON UPDATE NO ACTION ON DELETE NO ACTION
    );

    CREATE INDEX [IX_ShopifyValueMapping_CollectionID] ON [dbo].[ShopifyValueMapping]([CollectionID]);
    CREATE INDEX [IX_ShopifyValueMapping_Status] ON [dbo].[ShopifyValueMapping]([Status]);
    PRINT 'Created ShopifyValueMapping table';
END
GO

-- Add CollectionID column to Sku table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sku') AND name = 'CollectionID')
BEGIN
    ALTER TABLE [dbo].[Sku] ADD [CollectionID] INT NULL;
    PRINT 'Added CollectionID column to Sku table';
END
GO

-- Add foreign key constraint for Sku.CollectionID
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Sku_Collection')
BEGIN
    ALTER TABLE [dbo].[Sku]
    ADD CONSTRAINT [FK_Sku_Collection] FOREIGN KEY ([CollectionID])
        REFERENCES [dbo].[Collection]([ID]) ON UPDATE NO ACTION ON DELETE NO ACTION;
    PRINT 'Added FK_Sku_Collection constraint';
END
GO

-- Create index on Sku.CollectionID
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sku_CollectionID' AND object_id = OBJECT_ID('dbo.Sku'))
BEGIN
    CREATE INDEX [IX_Sku_CollectionID] ON [dbo].[Sku]([CollectionID]);
    PRINT 'Created index IX_Sku_CollectionID';
END
GO

PRINT 'Migration complete: Collection and ShopifyValueMapping tables created successfully';
