-- Migration: Add Export Policy Fields to SyncSettings
-- Phase 1: Single Source of Truth for Export Policy
-- 
-- These fields allow admin-configurable export settings instead of hardcoded constants.
-- All fields have defaults matching the previous hardcoded values in export-config.ts.

-- Add export policy columns to SyncSettings table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SyncSettings') AND name = 'ExportThumbnailSize')
BEGIN
    ALTER TABLE [dbo].[SyncSettings] ADD [ExportThumbnailSize] INT NOT NULL DEFAULT 120;
    PRINT 'Added ExportThumbnailSize column';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SyncSettings') AND name = 'ExportExcelDisplayPx')
BEGIN
    ALTER TABLE [dbo].[SyncSettings] ADD [ExportExcelDisplayPx] INT NOT NULL DEFAULT 96;
    PRINT 'Added ExportExcelDisplayPx column';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SyncSettings') AND name = 'ExportPdfDisplayPx')
BEGIN
    ALTER TABLE [dbo].[SyncSettings] ADD [ExportPdfDisplayPx] INT NOT NULL DEFAULT 60;
    PRINT 'Added ExportPdfDisplayPx column';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SyncSettings') AND name = 'ExportRequireS3')
BEGIN
    ALTER TABLE [dbo].[SyncSettings] ADD [ExportRequireS3] BIT NOT NULL DEFAULT 1;
    PRINT 'Added ExportRequireS3 column';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SyncSettings') AND name = 'ExportAllowShopifyFallback')
BEGIN
    ALTER TABLE [dbo].[SyncSettings] ADD [ExportAllowShopifyFallback] BIT NOT NULL DEFAULT 1;
    PRINT 'Added ExportAllowShopifyFallback column';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SyncSettings') AND name = 'ExportImageConcurrency')
BEGIN
    ALTER TABLE [dbo].[SyncSettings] ADD [ExportImageConcurrency] INT NOT NULL DEFAULT 10;
    PRINT 'Added ExportImageConcurrency column';
END
GO

PRINT 'Export policy fields migration complete';
