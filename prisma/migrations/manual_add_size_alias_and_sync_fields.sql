-- Migration: Add SizeAlias table and new sync/sku fields
-- Features: Size Alias mapping, Image Source toggle, Shopify admin links, Product grouping
-- Date: 2026-01-26
--
-- IMPORTANT: Review and run this on the production database
-- Backup the database before running this migration

-- ============================================================================
-- 1. Add ShopifyProductId column to Sku table
-- ============================================================================
-- Used for grouping variants by Shopify product (stable grouping key)

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sku') AND name = 'ShopifyProductId')
BEGIN
    ALTER TABLE [dbo].[Sku] ADD [ShopifyProductId] NVARCHAR(500) NULL;
    PRINT 'Added ShopifyProductId column to Sku table';
END
GO

-- ============================================================================
-- 2. Add UseProductImageGallery column to SyncSettings table
-- ============================================================================
-- Toggle between featured image (false) and gallery first image (true)

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SyncSettings') AND name = 'UseProductImageGallery')
BEGIN
    ALTER TABLE [dbo].[SyncSettings] ADD [UseProductImageGallery] BIT NOT NULL CONSTRAINT DF_SyncSettings_UseProductImageGallery DEFAULT 0;
    PRINT 'Added UseProductImageGallery column to SyncSettings table';
END
GO

-- ============================================================================
-- 3. Add ShopifyStoreDomain column to SyncSettings table
-- ============================================================================
-- Used for building Shopify admin links in Missing Data panels

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SyncSettings') AND name = 'ShopifyStoreDomain')
BEGIN
    ALTER TABLE [dbo].[SyncSettings] ADD [ShopifyStoreDomain] NVARCHAR(200) NULL;
    PRINT 'Added ShopifyStoreDomain column to SyncSettings table';
END
GO

-- ============================================================================
-- 4. Create SizeAlias table
-- ============================================================================
-- Maps raw Shopify size strings to canonical sizes for sorting
-- Allows format variants (e.g., "XS/S (6-8)" vs "XS/S(6-8)") to sort identically

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.SizeAlias') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[SizeAlias] (
        [ID] INT IDENTITY(1,1) NOT NULL,
        [RawSize] NVARCHAR(100) NOT NULL,           -- Exact string from Shopify
        [CanonicalSize] NVARCHAR(100) NOT NULL,     -- Mapped size for sorting
        [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedBy] NVARCHAR(255) NULL,
        CONSTRAINT [PK_SizeAlias] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [UQ_SizeAlias_RawSize] UNIQUE ([RawSize])
    );

    -- Index for lookups by canonical size
    CREATE NONCLUSTERED INDEX [IX_SizeAlias_CanonicalSize] ON [dbo].[SizeAlias] ([CanonicalSize]);

    PRINT 'Created SizeAlias table with unique constraint and index';
END
GO

-- ============================================================================
-- Verification
-- ============================================================================
PRINT '--- Migration Verification ---';

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Sku') AND name = 'ShopifyProductId')
    PRINT 'OK: Sku.ShopifyProductId exists';
ELSE
    PRINT 'FAIL: Sku.ShopifyProductId missing';

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SyncSettings') AND name = 'UseProductImageGallery')
    PRINT 'OK: SyncSettings.UseProductImageGallery exists';
ELSE
    PRINT 'FAIL: SyncSettings.UseProductImageGallery missing';

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SyncSettings') AND name = 'ShopifyStoreDomain')
    PRINT 'OK: SyncSettings.ShopifyStoreDomain exists';
ELSE
    PRINT 'FAIL: SyncSettings.ShopifyStoreDomain missing';

IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.SizeAlias') AND type = 'U')
    PRINT 'OK: SizeAlias table exists';
ELSE
    PRINT 'FAIL: SizeAlias table missing';

PRINT '--- Migration Complete ---';
GO
