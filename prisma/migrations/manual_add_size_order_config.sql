-- Migration: Add SizeOrderConfig table
-- Feature: Size Order Admin Configuration
-- Date: 2026-01-20
--
-- IMPORTANT: Review and run this on the production database
-- Backup the database before running this migration

-- Create SizeOrderConfig table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.SizeOrderConfig') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[SizeOrderConfig] (
        [ID] INT IDENTITY(1,1) NOT NULL,
        [Sizes] NVARCHAR(MAX) NOT NULL,           -- JSON array of size strings
        [UpdatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedBy] NVARCHAR(255) NULL,
        CONSTRAINT [PK_SizeOrderConfig] PRIMARY KEY CLUSTERED ([ID])
    );

    PRINT 'Created SizeOrderConfig table';
END
GO
