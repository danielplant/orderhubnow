BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[PlannedShipments] ADD [IsCombined] BIT NOT NULL CONSTRAINT [PlannedShipments_IsCombined_df] DEFAULT 0,
[OriginalShipmentIds] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[ShipmentItems] ADD [PlannedShipmentID] BIGINT;

-- AlterTable
ALTER TABLE [dbo].[SyncSettings] ADD [ExportAllowShopifyFallback] BIT NOT NULL CONSTRAINT [SyncSettings_ExportAllowShopifyFallback_df] DEFAULT 1,
[ExportExcelDisplayPx] INT NOT NULL CONSTRAINT [SyncSettings_ExportExcelDisplayPx_df] DEFAULT 96,
[ExportImageConcurrency] INT NOT NULL CONSTRAINT [SyncSettings_ExportImageConcurrency_df] DEFAULT 10,
[ExportPdfDisplayPx] INT NOT NULL CONSTRAINT [SyncSettings_ExportPdfDisplayPx_df] DEFAULT 60,
[ExportRequireS3] BIT NOT NULL CONSTRAINT [SyncSettings_ExportRequireS3_df] DEFAULT 1,
[ExportThumbnailSize] INT NOT NULL CONSTRAINT [SyncSettings_ExportThumbnailSize_df] DEFAULT 120;

-- CreateTable
CREATE TABLE [dbo].[ExportJob] (
    [id] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(20) NOT NULL,
    [triggeredBy] NVARCHAR(100) NOT NULL,
    [triggeredByRole] NVARCHAR(20) NOT NULL,
    [filters] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [ExportJob_status_df] DEFAULT 'pending',
    [currentStep] NVARCHAR(50),
    [currentStepDetail] NVARCHAR(500),
    [progressPercent] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ExportJob_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [startedAt] DATETIME2,
    [completedAt] DATETIME2,
    [durationMs] INT,
    [totalSkus] INT,
    [imagesProcessed] INT,
    [s3Hits] INT,
    [shopifyFallbacks] INT,
    [imageFetchFails] INT,
    [outputS3Key] NVARCHAR(500),
    [outputFilename] NVARCHAR(200),
    [outputSizeBytes] INT,
    [expiresAt] DATETIME2,
    [errorMessage] NVARCHAR(max),
    [retryCount] INT NOT NULL CONSTRAINT [ExportJob_retryCount_df] DEFAULT 0,
    CONSTRAINT [ExportJob_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ExportJob_status_createdAt] ON [dbo].[ExportJob]([status], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ExportJob_triggeredBy] ON [dbo].[ExportJob]([triggeredBy]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_ShipmentItems_PlannedShipmentID] ON [dbo].[ShipmentItems]([PlannedShipmentID]);

-- AddForeignKey
ALTER TABLE [dbo].[ShipmentItems] ADD CONSTRAINT [FK_ShipmentItems_PlannedShipment] FOREIGN KEY ([PlannedShipmentID]) REFERENCES [dbo].[PlannedShipments]([ID]) ON DELETE SET NULL ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

