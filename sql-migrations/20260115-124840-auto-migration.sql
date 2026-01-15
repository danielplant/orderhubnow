-- Auto-generated migration to sync production with local schema
-- Generated: Thu 15 Jan 2026 12:48:40 EST
-- Run this on production database before deploying

BEGIN TRY

BEGIN TRAN;

-- RedefineTables
BEGIN TRANSACTION;
DECLARE @SQL NVARCHAR(MAX) = N''
SELECT @SQL += N'ALTER TABLE '
    + QUOTENAME(OBJECT_SCHEMA_NAME(PARENT_OBJECT_ID))
    + '.'
    + QUOTENAME(OBJECT_NAME(PARENT_OBJECT_ID))
    + ' DROP CONSTRAINT '
    + OBJECT_NAME(OBJECT_ID) + ';'
FROM SYS.OBJECTS
WHERE TYPE_DESC LIKE '%CONSTRAINT'
    AND OBJECT_NAME(PARENT_OBJECT_ID) = 'AuthTokens_Orphaned_Backup'
    AND SCHEMA_NAME(SCHEMA_ID) = 'dbo'
EXEC sp_executesql @SQL
;
CREATE TABLE [dbo].[_prisma_new_AuthTokens_Orphaned_Backup] (
    [ID] BIGINT NOT NULL,
    [UserID] BIGINT NOT NULL,
    [Token] NVARCHAR(500) NOT NULL,
    [ExpiresAt] DATETIME NOT NULL,
    [CreatedAt] DATETIME NOT NULL,
    CONSTRAINT [PK_AuthTokens_Orphaned_Backup] PRIMARY KEY CLUSTERED ([ID])
);
IF EXISTS(SELECT * FROM [dbo].[AuthTokens_Orphaned_Backup])
    EXEC('INSERT INTO [dbo].[_prisma_new_AuthTokens_Orphaned_Backup] ([CreatedAt],[ExpiresAt],[ID],[UserID]) SELECT [CreatedAt],[ExpiresAt],[ID],[UserID] FROM [dbo].[AuthTokens_Orphaned_Backup] WITH (holdlock tablockx)');
DROP TABLE [dbo].[AuthTokens_Orphaned_Backup];
EXEC SP_RENAME N'dbo._prisma_new_AuthTokens_Orphaned_Backup', N'AuthTokens_Orphaned_Backup';
SET @SQL = N''
SELECT @SQL += N'ALTER TABLE '
    + QUOTENAME(OBJECT_SCHEMA_NAME(PARENT_OBJECT_ID))
    + '.'
    + QUOTENAME(OBJECT_NAME(PARENT_OBJECT_ID))
    + ' DROP CONSTRAINT '
    + OBJECT_NAME(OBJECT_ID) + ';'
FROM SYS.OBJECTS
WHERE TYPE_DESC LIKE '%CONSTRAINT'
    AND OBJECT_NAME(PARENT_OBJECT_ID) = 'CustomerOrdersItems_Orphaned_Backup'
    AND SCHEMA_NAME(SCHEMA_ID) = 'dbo'
EXEC sp_executesql @SQL
;
CREATE TABLE [dbo].[_prisma_new_CustomerOrdersItems_Orphaned_Backup] (
    [ID] BIGINT NOT NULL,
    [CustomerOrderID] BIGINT NOT NULL,
    [OrderNumber] NVARCHAR(50) NOT NULL,
    [SKU] NVARCHAR(50) NOT NULL,
    [SKUVariantID] BIGINT NOT NULL,
    [Quantity] INT NOT NULL,
    [Price] FLOAT(53) NOT NULL,
    [PriceCurrency] NVARCHAR(50) NOT NULL,
    [Notes] NVARCHAR(max) NOT NULL,
    [LineDiscount] FLOAT(53),
    [Status] NVARCHAR(20),
    [CancelledQty] INT,
    [CancelledAt] DATETIME,
    [CancelledBy] NVARCHAR(255),
    [CancelledReason] NVARCHAR(100),
    CONSTRAINT [PK_CustomerOrdersItems_Orphaned_Backup] PRIMARY KEY CLUSTERED ([ID])
);
IF EXISTS(SELECT * FROM [dbo].[CustomerOrdersItems_Orphaned_Backup])
    EXEC('INSERT INTO [dbo].[_prisma_new_CustomerOrdersItems_Orphaned_Backup] ([CancelledAt],[CancelledBy],[CancelledQty],[CancelledReason],[CustomerOrderID],[ID],[LineDiscount],[Notes],[OrderNumber],[Price],[PriceCurrency],[Quantity],[SKU],[SKUVariantID],[Status]) SELECT [CancelledAt],[CancelledBy],[CancelledQty],[CancelledReason],[CustomerOrderID],[ID],[LineDiscount],[Notes],[OrderNumber],[Price],[PriceCurrency],[Quantity],[SKU],[SKUVariantID],[Status] FROM [dbo].[CustomerOrdersItems_Orphaned_Backup] WITH (holdlock tablockx)');
DROP TABLE [dbo].[CustomerOrdersItems_Orphaned_Backup];
EXEC SP_RENAME N'dbo._prisma_new_CustomerOrdersItems_Orphaned_Backup', N'CustomerOrdersItems_Orphaned_Backup';
COMMIT;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

-- Register this migration
IF NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE Name = '20260115-124840-auto-migration')
    INSERT INTO SchemaMigrations (Name) VALUES ('20260115-124840-auto-migration');
GO
