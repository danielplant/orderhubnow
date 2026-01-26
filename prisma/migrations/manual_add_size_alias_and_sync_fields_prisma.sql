-- Migration: Add SizeAlias table and new sync/sku fields
-- Prisma-compatible version (no GO statements)
-- Date: 2026-01-26

-- 1. Add ShopifyProductId column to Sku table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sku') AND name = 'ShopifyProductId')
    ALTER TABLE [dbo].[Sku] ADD [ShopifyProductId] NVARCHAR(500) NULL;

-- 2. Add UseProductImageGallery column to SyncSettings table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SyncSettings') AND name = 'UseProductImageGallery')
    ALTER TABLE [dbo].[SyncSettings] ADD [UseProductImageGallery] BIT NOT NULL CONSTRAINT DF_SyncSettings_UseProductImageGallery DEFAULT 0;

-- 3. Add ShopifyStoreDomain column to SyncSettings table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SyncSettings') AND name = 'ShopifyStoreDomain')
    ALTER TABLE [dbo].[SyncSettings] ADD [ShopifyStoreDomain] NVARCHAR(200) NULL;

-- 4. Create SizeAlias table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.SizeAlias') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[SizeAlias] (
        [ID] INT IDENTITY(1,1) NOT NULL,
        [RawSize] NVARCHAR(100) NOT NULL,
        [CanonicalSize] NVARCHAR(100) NOT NULL,
        [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedBy] NVARCHAR(255) NULL,
        CONSTRAINT [PK_SizeAlias] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [UQ_SizeAlias_RawSize] UNIQUE ([RawSize])
    );
    CREATE NONCLUSTERED INDEX [IX_SizeAlias_CanonicalSize] ON [dbo].[SizeAlias] ([CanonicalSize]);
END;
