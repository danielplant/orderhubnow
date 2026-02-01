-- Phase 3: Durable Background Jobs
-- Creates ExportJob table for tracking async export operations
-- 
-- This table tracks XLSX and PDF export jobs that are processed
-- asynchronously via BullMQ queue workers.

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ExportJob]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ExportJob] (
        -- Primary key (UUID)
        [id]                NVARCHAR(36)    NOT NULL PRIMARY KEY DEFAULT NEWID(),
        
        -- Job identity
        [type]              NVARCHAR(20)    NOT NULL,           -- xlsx | pdf
        [triggeredBy]       NVARCHAR(100)   NOT NULL,           -- userId or system
        [triggeredByRole]   NVARCHAR(20)    NOT NULL,           -- admin | rep
        
        -- Input parameters (JSON)
        [filters]           NVARCHAR(MAX)   NOT NULL,           -- { collections, currency, q, orientation }
        
        -- Status tracking
        [status]            NVARCHAR(20)    NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed | cancelled | expired
        [currentStep]       NVARCHAR(50)    NULL,               -- querying | fetching_images | generating | uploading
        [currentStepDetail] NVARCHAR(500)   NULL,               -- Human-readable detail
        [progressPercent]   INT             NULL,               -- 0-100
        
        -- Timing
        [createdAt]         DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [startedAt]         DATETIME2       NULL,
        [completedAt]       DATETIME2       NULL,
        [durationMs]        INT             NULL,
        
        -- Results
        [totalSkus]         INT             NULL,
        [imagesProcessed]   INT             NULL,
        [s3Hits]            INT             NULL,
        [shopifyFallbacks]  INT             NULL,
        [imageFetchFails]   INT             NULL,
        
        -- Output
        [outputS3Key]       NVARCHAR(500)   NULL,               -- S3 key for completed file
        [outputFilename]    NVARCHAR(200)   NULL,               -- Original filename for download
        [outputSizeBytes]   INT             NULL,
        [expiresAt]         DATETIME2       NULL,               -- When S3 file should be cleaned up
        
        -- Error handling
        [errorMessage]      NVARCHAR(MAX)   NULL,
        [retryCount]        INT             NOT NULL DEFAULT 0
    );
    
    -- Indexes for common queries
    CREATE INDEX [IX_ExportJob_status_createdAt] ON [dbo].[ExportJob] ([status], [createdAt]);
    CREATE INDEX [IX_ExportJob_triggeredBy] ON [dbo].[ExportJob] ([triggeredBy]);
    
    PRINT 'Created ExportJob table with indexes';
END
ELSE
BEGIN
    PRINT 'ExportJob table already exists';
END
GO
