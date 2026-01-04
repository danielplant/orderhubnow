-- ============================================================================
-- AliasSignals Table
-- ============================================================================
-- Stores multi-select filter patterns to learn entity aliases/variants
-- When users select multiple values (e.g., "John Smith", "John S.", "J. Smith")
-- for the same filter, this signals they may be the same entity.
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AliasSignals')
BEGIN
    CREATE TABLE AliasSignals (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        EntityType NVARCHAR(50) NOT NULL,        -- e.g., 'storeName', 'salesRep', 'sku'
        SelectedValues NVARCHAR(MAX) NOT NULL,   -- JSON array of selected values
        ReportType NVARCHAR(50) NOT NULL,        -- e.g., 'category-totals', 'rep-scorecard'
        CreatedBy INT NULL,                       -- User ID if authenticated
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        SessionID NVARCHAR(100) NULL              -- Browser session for deduplication
    );

    CREATE INDEX IX_AliasSignals_EntityType ON AliasSignals(EntityType);
    CREATE INDEX IX_AliasSignals_CreatedAt ON AliasSignals(CreatedAt);
    CREATE INDEX IX_AliasSignals_ReportType ON AliasSignals(ReportType);

    PRINT 'Created AliasSignals table';
END
GO

-- ============================================================================
-- Validation Query
-- ============================================================================

SELECT 
    'AliasSignals' AS TableName,
    COUNT(*) AS RecordCount
FROM AliasSignals;
GO
