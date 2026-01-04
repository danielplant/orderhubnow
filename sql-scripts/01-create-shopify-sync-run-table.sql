-- ============================================================
-- Script: Create ShopifySyncRun Table
-- Database: Limeapple_Live_Nov2024
-- Purpose: Tracks Shopify bulk sync operations for the new web app
-- ============================================================

CREATE TABLE ShopifySyncRun (
    ID BIGINT IDENTITY(1,1) NOT NULL,
    SyncType NVARCHAR(20) NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    OperationId NVARCHAR(255) NULL,
    StartedAt DATETIME NOT NULL,
    CompletedAt DATETIME NULL,
    ItemCount INT NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    CONSTRAINT PK_ShopifySyncRun PRIMARY KEY (ID)
);

CREATE INDEX IX_ShopifySyncRun_Status_StartedAt
ON ShopifySyncRun (Status, StartedAt);

-- ============================================================
-- End of script
-- ============================================================
