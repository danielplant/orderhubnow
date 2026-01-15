-- Auto-generated migration to sync production with local schema
-- Generated: Thu 15 Jan 2026 12:34:10 EST
-- Run this on production database before deploying

BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[ActivityLogs] ADD [Action] NVARCHAR(100),
[EntityID] BIGINT,
[EntityType] NVARCHAR(50),
[IPAddress] NVARCHAR(50),
[NewValues] NVARCHAR(max),
[OldValues] NVARCHAR(max),
[PerformedBy] NVARCHAR(255),
[UserAgent] NVARCHAR(500);

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

-- AlterTable
ALTER TABLE [dbo].[Sku] ADD [UnitPriceCAD] DECIMAL(10,2),
[UnitPriceUSD] DECIMAL(10,2),
[UnitsPerSku] INT CONSTRAINT [Sku_UnitsPerSku_df] DEFAULT 1;

-- AlterTable
ALTER TABLE [dbo].[Shipments] ADD [VoidNotes] NVARCHAR(max),
[VoidReason] NVARCHAR(100),
[VoidedAt] DATETIME,
[VoidedBy] NVARCHAR(255);

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

-- CreateTable
CREATE TABLE [dbo].[ShipmentDocuments] (
    [ID] BIGINT NOT NULL IDENTITY(1,1),
    [ShipmentID] BIGINT NOT NULL,
    [OrderID] BIGINT NOT NULL,
    [DocumentType] NVARCHAR(50) NOT NULL,
    [DocumentNumber] NVARCHAR(100) NOT NULL,
    [FileName] NVARCHAR(255) NOT NULL,
    [FilePath] NVARCHAR(500) NOT NULL,
    [FileSize] INT,
    [MimeType] NVARCHAR(100) NOT NULL CONSTRAINT [ShipmentDocuments_MimeType_df] DEFAULT 'application/pdf',
    [GeneratedAt] DATETIME NOT NULL CONSTRAINT [ShipmentDocuments_GeneratedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [GeneratedBy] NVARCHAR(255),
    [SentToCustomer] BIT NOT NULL CONSTRAINT [ShipmentDocuments_SentToCustomer_df] DEFAULT 0,
    [SentAt] DATETIME,
    CONSTRAINT [PK_ShipmentDocuments] PRIMARY KEY CLUSTERED ([ID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_FeatureInterest_Feature] ON [dbo].[FeatureInterest]([Feature]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_FeatureInterest_CreatedAt] ON [dbo].[FeatureInterest]([CreatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ShipmentDocuments_ShipmentID] ON [dbo].[ShipmentDocuments]([ShipmentID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ShipmentDocuments_OrderID] ON [dbo].[ShipmentDocuments]([OrderID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ShipmentDocuments_DocumentNumber] ON [dbo].[ShipmentDocuments]([DocumentNumber]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ShipmentDocuments_DocumentType] ON [dbo].[ShipmentDocuments]([DocumentType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ActivityLogs_EntityType] ON [dbo].[ActivityLogs]([EntityType], [EntityID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ActivityLogs_Action] ON [dbo].[ActivityLogs]([Action]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ActivityLogs_DateAdded] ON [dbo].[ActivityLogs]([DateAdded] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_Shipments_VoidedAt] ON [dbo].[Shipments]([VoidedAt]);

-- AddForeignKey (only if not exists)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CustomerOrdersItems_CustomerOrders')
    ALTER TABLE [dbo].[CustomerOrdersItems] ADD CONSTRAINT [FK_CustomerOrdersItems_CustomerOrders] FOREIGN KEY ([CustomerOrderID]) REFERENCES [dbo].[CustomerOrders]([ID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey (only if not exists)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_AuthTokens_Users')
    ALTER TABLE [dbo].[AuthTokens] ADD CONSTRAINT [FK_AuthTokens_Users] FOREIGN KEY ([UserID]) REFERENCES [dbo].[Users]([ID]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (only if not exists)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ShipmentDocuments_Shipment')
    ALTER TABLE [dbo].[ShipmentDocuments] ADD CONSTRAINT [FK_ShipmentDocuments_Shipment] FOREIGN KEY ([ShipmentID]) REFERENCES [dbo].[Shipments]([ID]) ON DELETE CASCADE ON UPDATE CASCADE;

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
IF NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE Name = '20260115-123410-auto-migration')
    INSERT INTO SchemaMigrations (Name) VALUES ('20260115-123410-auto-migration');
GO
