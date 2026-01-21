-- ============================================================================
-- Shopify Sync Runtime Config Flags
-- Purpose: Store runtime toggles for sync behavior (ingestion/transfer)
-- ============================================================================

PRINT 'Creating SyncRuntimeConfig table (if missing)...';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncRuntimeConfig')
BEGIN
    CREATE TABLE SyncRuntimeConfig (
        ID INT IDENTITY(1,1) NOT NULL,
        EntityType NVARCHAR(50) NOT NULL,
        ConfigKey NVARCHAR(100) NOT NULL,
        Enabled BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_SyncRuntimeConfig PRIMARY KEY (ID),
        CONSTRAINT UQ_SyncRuntimeConfig_EntityType_ConfigKey UNIQUE (EntityType, ConfigKey)
    );

    CREATE INDEX IX_SyncRuntimeConfig_EntityType ON SyncRuntimeConfig (EntityType);
    CREATE INDEX IX_SyncRuntimeConfig_EntityType_Enabled ON SyncRuntimeConfig (EntityType, Enabled);

    PRINT 'Created SyncRuntimeConfig table';
END
ELSE
BEGIN
    PRINT 'SyncRuntimeConfig table already exists - skipping';
END

-- Grant permissions on new table
GRANT INSERT, UPDATE, DELETE ON SyncRuntimeConfig TO limeappleNext;

PRINT 'SyncRuntimeConfig migration complete.';
