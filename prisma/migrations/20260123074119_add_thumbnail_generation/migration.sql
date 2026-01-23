-- Add per-size enable toggles to SyncSettings
ALTER TABLE SyncSettings ADD ThumbnailSizeSmEnabled BIT NOT NULL CONSTRAINT DF_SyncSettings_ThumbnailSizeSmEnabled DEFAULT 1;
ALTER TABLE SyncSettings ADD ThumbnailSizeMdEnabled BIT NOT NULL CONSTRAINT DF_SyncSettings_ThumbnailSizeMdEnabled DEFAULT 1;
ALTER TABLE SyncSettings ADD ThumbnailSizeLgEnabled BIT NOT NULL CONSTRAINT DF_SyncSettings_ThumbnailSizeLgEnabled DEFAULT 1;
ALTER TABLE SyncSettings ADD ThumbnailSizeXlEnabled BIT NOT NULL CONSTRAINT DF_SyncSettings_ThumbnailSizeXlEnabled DEFAULT 1;

-- Add thumbnail during sync toggle (OFF by default)
ALTER TABLE SyncSettings ADD ThumbnailDuringSync BIT NOT NULL CONSTRAINT DF_SyncSettings_ThumbnailDuringSync DEFAULT 0;

-- Create ThumbnailGenerationRun table
CREATE TABLE ThumbnailGenerationRun (
    ID BIGINT IDENTITY(1,1) NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    StartedAt DATETIME NOT NULL,
    CompletedAt DATETIME NULL,
    CurrentStep NVARCHAR(50) NULL,
    CurrentStepDetail NVARCHAR(500) NULL,
    ProgressPercent INT NULL,
    TotalImages INT NULL,
    ProcessedCount INT NULL CONSTRAINT DF_ThumbnailGenerationRun_ProcessedCount DEFAULT 0,
    SkippedCount INT NULL CONSTRAINT DF_ThumbnailGenerationRun_SkippedCount DEFAULT 0,
    FailedCount INT NULL CONSTRAINT DF_ThumbnailGenerationRun_FailedCount DEFAULT 0,
    EnabledSizes NVARCHAR(50) NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    CONSTRAINT PK_ThumbnailGenerationRun PRIMARY KEY CLUSTERED (ID ASC)
);

-- Create index for status queries
CREATE NONCLUSTERED INDEX IX_ThumbnailGenerationRun_Status_StartedAt
ON ThumbnailGenerationRun (Status ASC, StartedAt DESC);
