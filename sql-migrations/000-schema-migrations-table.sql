-- Migration: Create SchemaMigrations table for tracking applied migrations
-- Date: 2026-01-15
--
-- This table tracks which SQL migrations have been applied to the database.
-- Run this on the EC2 database first, then run 001-seed-existing-migrations.sql

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.SchemaMigrations') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[SchemaMigrations] (
        [ID] INT IDENTITY(1,1) NOT NULL,
        [Name] NVARCHAR(255) NOT NULL,
        [AppliedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT [PK_SchemaMigrations] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [UQ_SchemaMigrations_Name] UNIQUE ([Name])
    );
    PRINT 'Created SchemaMigrations table';
END
GO

-- Register this migration
IF NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE Name = '000-schema-migrations-table')
    INSERT INTO SchemaMigrations (Name) VALUES ('000-schema-migrations-table');
GO
