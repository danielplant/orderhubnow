-- Create DisplayRule table for scenario x view matrix
-- Note: [View] is escaped because VIEW is a reserved keyword in SQL Server
CREATE TABLE DisplayRule (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    Scenario NVARCHAR(50) NOT NULL,
    [View] NVARCHAR(50) NOT NULL,
    FieldSource NVARCHAR(50) NOT NULL,
    Label NVARCHAR(100) NOT NULL,
    RowBehavior NVARCHAR(20) NOT NULL DEFAULT 'show',
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_DisplayRule_Scenario_View UNIQUE (Scenario, [View])
);
