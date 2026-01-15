-- Auto-generated migration to sync production with local schema
-- Generated: Thu 15 Jan 2026 00:40:13 EST
-- Run this on production database before deploying

BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[CustomerOrders] ADD [IsPreOrder] BIT,
[ShopifyFinancialStatus] NVARCHAR(20),
[ShopifyFulfillmentStatus] NVARCHAR(20),
[ShopifyStatusSyncedAt] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[CustomerOrdersItems] ADD [CancelledAt] DATETIME,
[CancelledBy] NVARCHAR(255),
[CancelledQty] INT CONSTRAINT [CustomerOrdersItems_CancelledQty_df] DEFAULT 0,
[CancelledReason] NVARCHAR(100),
[LineDiscount] FLOAT(53) CONSTRAINT [CustomerOrdersItems_LineDiscount_df] DEFAULT 0,
[Status] NVARCHAR(20) CONSTRAINT [CustomerOrdersItems_Status_df] DEFAULT 'Open';

-- DropTable
DROP TABLE [dbo].[Sku_backup_2026_01_14_02_2];

-- CreateTable
CREATE TABLE [dbo].[FeatureInterest] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [Feature] NVARCHAR(100) NOT NULL,
    [SelectedOptions] NVARCHAR(max),
    [FreeText] NVARCHAR(max),
    [OrderId] BIGINT,
    [OrderNumber] NVARCHAR(50),
    [UserId] NVARCHAR(255),
    [CreatedAt] DATETIME NOT NULL CONSTRAINT [FeatureInterest_CreatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_FeatureInterest] PRIMARY KEY CLUSTERED ([ID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_FeatureInterest_Feature] ON [dbo].[FeatureInterest]([Feature]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_FeatureInterest_CreatedAt] ON [dbo].[FeatureInterest]([CreatedAt]);

-- AddForeignKey
ALTER TABLE [dbo].[CustomerOrdersItems] ADD CONSTRAINT [FK_CustomerOrdersItems_CustomerOrders] FOREIGN KEY ([CustomerOrderID]) REFERENCES [dbo].[CustomerOrders]([ID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuthTokens] ADD CONSTRAINT [FK_AuthTokens_Users] FOREIGN KEY ([UserID]) REFERENCES [dbo].[Users]([ID]) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
EXEC SP_RENAME N'dbo.ShopifyValueMapping.UQ_ShopifyValueMapping_RawValue', N'ShopifyValueMapping_RawValue_key', N'INDEX';

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
IF NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE Name = '20260115-004013-auto-migration')
    INSERT INTO SchemaMigrations (Name) VALUES ('20260115-004013-auto-migration');
GO
