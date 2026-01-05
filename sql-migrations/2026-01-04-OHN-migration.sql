-- ============================================================================
-- ORDERHUBNOW MASTER MIGRATION SCRIPT
-- ============================================================================
-- Database: Limeapple_Live_Nov2024
-- Server: 3.141.136.218:1433
-- 
-- INSTRUCTIONS FOR BILAL:
-- 1. Run this ENTIRE script in SQL Server Management Studio
-- 2. All sections are idempotent (safe to re-run)
-- 3. Expected runtime: ~2-5 minutes
-- 
-- Created: 2026-01-05
-- ============================================================================

PRINT '============================================================================';
PRINT 'ORDERHUBNOW MASTER MIGRATION - STARTING';
PRINT '============================================================================';
PRINT '';

-- ============================================================================
-- SECTION 1: GRANT WRITE PERMISSIONS
-- Purpose: Enable INSERT/UPDATE/DELETE for the web application
-- ============================================================================

PRINT 'SECTION 1: Granting write permissions to limeappleNext...';

GRANT INSERT, UPDATE, DELETE ON Sku TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON Customers TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON CustomerOrders TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON CustomerOrdersItems TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON CustomerOrdersComments TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON MissingShopifySkus TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON RawSkusFromShopify TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON CustomersFromShopify TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON SkuCategories TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON SkuMainCategory TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON SkuMainSubRship TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON Reps TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON Users TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON PPSizes TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON InventorySettings TO limeappleNext;

PRINT 'SECTION 1: Write permissions granted.';
PRINT '';
GO

-- ============================================================================
-- SECTION 2: SHOPIFY SYNC TRACKING TABLE
-- Purpose: Track Shopify bulk sync operations
-- ============================================================================

PRINT 'SECTION 2: Creating ShopifySyncRun table...';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ShopifySyncRun')
BEGIN
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

    CREATE INDEX IX_ShopifySyncRun_Status_StartedAt ON ShopifySyncRun (Status, StartedAt);
    
    PRINT 'Created ShopifySyncRun table';
END
ELSE
BEGIN
    PRINT 'ShopifySyncRun table already exists - skipping';
END

-- Grant permissions on new table
GRANT INSERT, UPDATE, DELETE ON ShopifySyncRun TO limeappleNext;

PRINT 'SECTION 2: Complete.';
PRINT '';
GO

-- ============================================================================
-- SECTION 3: ALIAS SIGNALS TABLE
-- Purpose: Learn entity aliases from user filter selections
-- ============================================================================

PRINT 'SECTION 3: Creating AliasSignals table...';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AliasSignals')
BEGIN
    CREATE TABLE AliasSignals (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        EntityType NVARCHAR(50) NOT NULL,
        SelectedValues NVARCHAR(MAX) NOT NULL,
        ReportType NVARCHAR(50) NOT NULL,
        CreatedBy INT NULL,
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        SessionID NVARCHAR(100) NULL
    );

    CREATE INDEX IX_AliasSignals_EntityType ON AliasSignals(EntityType);
    CREATE INDEX IX_AliasSignals_CreatedAt ON AliasSignals(CreatedAt);
    CREATE INDEX IX_AliasSignals_ReportType ON AliasSignals(ReportType);

    PRINT 'Created AliasSignals table';
END
ELSE
BEGIN
    PRINT 'AliasSignals table already exists - skipping';
END

GRANT INSERT, UPDATE, DELETE ON AliasSignals TO limeappleNext;

PRINT 'SECTION 3: Complete.';
PRINT '';
GO

-- ============================================================================
-- SECTION 4: AUTH SYSTEM (Password Security)
-- Purpose: Secure password hashing and invite/reset flow
-- ============================================================================

PRINT 'SECTION 4: Setting up auth system...';

-- Add PasswordHash column to Users
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'PasswordHash'
)
BEGIN
    ALTER TABLE Users ADD PasswordHash NVARCHAR(255) NULL;
    PRINT 'Added PasswordHash column to Users';
END
GO

-- Add Status column to Users
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'Status'
)
BEGIN
    ALTER TABLE Users ADD Status NVARCHAR(20) NULL DEFAULT 'legacy';
    PRINT 'Added Status column to Users';
    
    -- Set all existing users to 'legacy' status
    UPDATE Users SET Status = 'legacy' WHERE Status IS NULL;
    PRINT 'Set existing users to legacy status';
END
GO

-- Add MustResetPassword column to Users
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'MustResetPassword'
)
BEGIN
    ALTER TABLE Users ADD MustResetPassword BIT NULL DEFAULT 0;
    PRINT 'Added MustResetPassword column to Users';
END
GO

-- Add Email column to Users (may already exist)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'Email'
)
BEGIN
    ALTER TABLE Users ADD Email NVARCHAR(255) NULL;
    PRINT 'Added Email column to Users';
END
GO

-- Create AuthTokens table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AuthTokens')
BEGIN
    CREATE TABLE AuthTokens (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        UserID INT NOT NULL,
        Token NVARCHAR(255) NOT NULL,
        TokenType NVARCHAR(20) NOT NULL,  -- 'invite', 'reset'
        ExpiresAt DATETIME NOT NULL,
        UsedAt DATETIME NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_AuthTokens_Users FOREIGN KEY (UserID) REFERENCES Users(ID)
    );

    CREATE UNIQUE INDEX IX_AuthTokens_Token ON AuthTokens(Token);
    CREATE INDEX IX_AuthTokens_UserID ON AuthTokens(UserID);
    CREATE INDEX IX_AuthTokens_ExpiresAt ON AuthTokens(ExpiresAt);

    PRINT 'Created AuthTokens table';
END
ELSE
BEGIN
    PRINT 'AuthTokens table already exists - skipping';
END

GRANT INSERT, UPDATE, DELETE ON AuthTokens TO limeappleNext;

-- Backfill Email from LoginID or Reps table
UPDATE u
SET u.Email = COALESCE(
    CASE WHEN u.LoginID LIKE '%@%' THEN u.LoginID ELSE NULL END,
    r.Email1
)
FROM Users u
LEFT JOIN Reps r ON u.RepId = r.ID
WHERE u.Email IS NULL;

PRINT 'Backfilled Email column in Users';

PRINT 'SECTION 4: Complete.';
PRINT '';
GO

-- ============================================================================
-- SECTION 5: ORDER NUMBER SEQUENCE (Thread-Safe Generation)
-- Purpose: Fix race condition in order number generation
-- ============================================================================

PRINT 'SECTION 5: Setting up order number sequence...';

-- Create OrderNumberSequence table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'OrderNumberSequence')
BEGIN
    CREATE TABLE OrderNumberSequence (
        Prefix CHAR(1) NOT NULL PRIMARY KEY,  -- 'A' for ATS, 'P' for PreOrder
        LastNumber INT NOT NULL DEFAULT 0,
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );

    -- Initialize with current max values from existing orders
    DECLARE @MaxA INT, @MaxP INT;

    SELECT @MaxA = ISNULL(MAX(CAST(SUBSTRING(OrderNumber, 2, LEN(OrderNumber)-1) AS INT)), 0)
    FROM CustomerOrders
    WHERE OrderNumber LIKE 'A%' AND ISNUMERIC(SUBSTRING(OrderNumber, 2, LEN(OrderNumber)-1)) = 1;

    SELECT @MaxP = ISNULL(MAX(CAST(SUBSTRING(OrderNumber, 2, LEN(OrderNumber)-1) AS INT)), 0)
    FROM CustomerOrders
    WHERE OrderNumber LIKE 'P%' AND ISNUMERIC(SUBSTRING(OrderNumber, 2, LEN(OrderNumber)-1)) = 1;

    INSERT INTO OrderNumberSequence (Prefix, LastNumber, UpdatedAt)
    VALUES ('A', @MaxA, GETDATE()), ('P', @MaxP, GETDATE());

    PRINT 'Created and initialized OrderNumberSequence table';
    PRINT 'A prefix initialized to: ' + CAST(@MaxA AS VARCHAR(20));
    PRINT 'P prefix initialized to: ' + CAST(@MaxP AS VARCHAR(20));
END
ELSE
BEGIN
    PRINT 'OrderNumberSequence table already exists - skipping';
END

GRANT INSERT, UPDATE, DELETE ON OrderNumberSequence TO limeappleNext;
GO

-- Create stored procedure for atomic order number generation
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'uspGetNextOrderNumber')
BEGIN
    DROP PROCEDURE uspGetNextOrderNumber;
    PRINT 'Dropped existing uspGetNextOrderNumber procedure';
END
GO

CREATE PROCEDURE uspGetNextOrderNumber
    @Prefix CHAR(1),
    @OrderNumber NVARCHAR(50) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @NextNumber INT;
    
    -- Atomic increment using UPDATE with OUTPUT
    UPDATE OrderNumberSequence
    SET @NextNumber = LastNumber = LastNumber + 1,
        UpdatedAt = GETDATE()
    WHERE Prefix = @Prefix;
    
    IF @@ROWCOUNT = 0
    BEGIN
        -- Prefix doesn't exist, initialize it
        INSERT INTO OrderNumberSequence (Prefix, LastNumber, UpdatedAt)
        VALUES (@Prefix, 1, GETDATE());
        SET @NextNumber = 1;
    END
    
    SET @OrderNumber = @Prefix + CAST(@NextNumber AS NVARCHAR(20));
END
GO

GRANT EXECUTE ON uspGetNextOrderNumber TO limeappleNext;
PRINT 'Created uspGetNextOrderNumber stored procedure';

-- Add unique constraint on OrderNumber (if not exists)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE object_id = OBJECT_ID('CustomerOrders') 
    AND name = 'UQ_CustomerOrders_OrderNumber'
)
BEGIN
    -- Check for duplicates first
    IF NOT EXISTS (
        SELECT OrderNumber FROM CustomerOrders 
        GROUP BY OrderNumber HAVING COUNT(*) > 1
    )
    BEGIN
        ALTER TABLE CustomerOrders
        ADD CONSTRAINT UQ_CustomerOrders_OrderNumber UNIQUE (OrderNumber);
        PRINT 'Added unique constraint on CustomerOrders.OrderNumber';
    END
    ELSE
    BEGIN
        PRINT 'WARNING: Duplicate OrderNumbers exist - unique constraint NOT added';
        PRINT 'Run this query to find duplicates:';
        PRINT 'SELECT OrderNumber, COUNT(*) FROM CustomerOrders GROUP BY OrderNumber HAVING COUNT(*) > 1';
    END
END
ELSE
BEGIN
    PRINT 'Unique constraint on OrderNumber already exists - skipping';
END

PRINT 'SECTION 5: Complete.';
PRINT '';
GO

-- ============================================================================
-- SECTION 6: ANALYTICS SCHEMA (Customer LTV, Segments, etc.)
-- Purpose: Enable advanced reporting and dashboards
-- ============================================================================

PRINT 'SECTION 6: Setting up analytics schema...';

-- Add CustomerID FK column to CustomerOrders
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'CustomerID'
)
BEGIN
    ALTER TABLE CustomerOrders ADD CustomerID INT NULL;
    PRINT 'Added CustomerID column to CustomerOrders';
END
GO

-- Add RepID FK column to CustomerOrders
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'RepID'
)
BEGIN
    ALTER TABLE CustomerOrders ADD RepID INT NULL;
    PRINT 'Added RepID column to CustomerOrders';
END
GO

-- Add analytics columns to Customers
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'FirstOrderDate')
BEGIN
    ALTER TABLE Customers ADD FirstOrderDate DATETIME NULL;
    PRINT 'Added FirstOrderDate to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'LastOrderDate')
BEGIN
    ALTER TABLE Customers ADD LastOrderDate DATETIME NULL;
    PRINT 'Added LastOrderDate to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'LTV')
BEGIN
    ALTER TABLE Customers ADD LTV DECIMAL(18,2) NULL;
    PRINT 'Added LTV to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'Segment')
BEGIN
    ALTER TABLE Customers ADD Segment NVARCHAR(20) NULL;
    PRINT 'Added Segment to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'OrderCount')
BEGIN
    ALTER TABLE Customers ADD OrderCount INT NULL DEFAULT 0;
    PRINT 'Added OrderCount to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'UsualOrderCycle')
BEGIN
    ALTER TABLE Customers ADD UsualOrderCycle INT NULL;
    PRINT 'Added UsualOrderCycle to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'EstimatedPotential')
BEGIN
    ALTER TABLE Customers ADD EstimatedPotential DECIMAL(18,2) NULL;
    PRINT 'Added EstimatedPotential to Customers';
END
GO

-- Add Territory to Reps
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Reps' AND COLUMN_NAME = 'Territory')
BEGIN
    ALTER TABLE Reps ADD Territory NVARCHAR(100) NULL;
    PRINT 'Added Territory to Reps';
END
GO

-- Create RepTargets table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RepTargets')
BEGIN
    CREATE TABLE RepTargets (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        RepID INT NOT NULL,
        PeriodType NVARCHAR(20) NOT NULL,
        PeriodStart DATETIME NOT NULL,
        TargetAmount DECIMAL(18,2) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NULL,
        CONSTRAINT FK_RepTargets_Reps FOREIGN KEY (RepID) REFERENCES Reps(ID)
    );
    
    CREATE INDEX IX_RepTargets_RepID ON RepTargets(RepID);
    PRINT 'Created RepTargets table';
END

GRANT INSERT, UPDATE, DELETE ON RepTargets TO limeappleNext;
GO

-- Backfill CustomerID by matching StoreName
PRINT 'Backfilling CustomerID...';
UPDATE co
SET co.CustomerID = c.ID
FROM CustomerOrders co
INNER JOIN Customers c ON LOWER(TRIM(co.StoreName)) = LOWER(TRIM(c.StoreName))
WHERE co.CustomerID IS NULL;
GO

-- Backfill RepID by matching SalesRep
PRINT 'Backfilling RepID...';
UPDATE co
SET co.RepID = r.ID
FROM CustomerOrders co
INNER JOIN Reps r ON LOWER(TRIM(co.SalesRep)) = LOWER(TRIM(r.Name))
WHERE co.RepID IS NULL;
GO

-- Populate Customer analytics
PRINT 'Calculating customer analytics...';
;WITH CustomerStats AS (
    SELECT 
        c.ID,
        MIN(co.OrderDate) AS FirstOrderDate,
        MAX(co.OrderDate) AS LastOrderDate,
        COUNT(co.ID) AS OrderCount,
        SUM(co.OrderAmount) AS LTV
    FROM Customers c
    LEFT JOIN CustomerOrders co ON co.CustomerID = c.ID
    GROUP BY c.ID
)
UPDATE c
SET 
    c.FirstOrderDate = cs.FirstOrderDate,
    c.LastOrderDate = cs.LastOrderDate,
    c.OrderCount = COALESCE(cs.OrderCount, 0),
    c.LTV = COALESCE(cs.LTV, 0)
FROM Customers c
INNER JOIN CustomerStats cs ON cs.ID = c.ID;
GO

-- Set Segments
UPDATE Customers
SET Segment = CASE
    WHEN LTV >= 100000 THEN 'Platinum'
    WHEN LTV >= 50000 THEN 'Gold'
    WHEN LTV >= 20000 THEN 'Silver'
    ELSE 'Bronze'
END
WHERE LTV IS NOT NULL;
GO

-- Create performance indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerOrders_CustomerID')
    CREATE INDEX IX_CustomerOrders_CustomerID ON CustomerOrders(CustomerID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerOrders_RepID')
    CREATE INDEX IX_CustomerOrders_RepID ON CustomerOrders(RepID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerOrders_OrderDate')
    CREATE INDEX IX_CustomerOrders_OrderDate ON CustomerOrders(OrderDate);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_Segment')
    CREATE INDEX IX_Customers_Segment ON Customers(Segment);

PRINT 'SECTION 6: Complete.';
PRINT '';
GO

-- ============================================================================
-- VALIDATION
-- ============================================================================

PRINT '============================================================================';
PRINT 'MIGRATION COMPLETE - VALIDATION RESULTS';
PRINT '============================================================================';
PRINT '';

-- Check tables exist
SELECT 'Tables Created' AS Check_Type, TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('ShopifySyncRun', 'AliasSignals', 'AuthTokens', 'OrderNumberSequence', 'RepTargets');

-- Check stored procedure exists
SELECT 'Stored Procedures' AS Check_Type, name 
FROM sys.procedures 
WHERE name = 'uspGetNextOrderNumber';

-- Check sequence values
SELECT 'Order Sequence' AS Check_Type, Prefix, LastNumber 
FROM OrderNumberSequence;

-- Check CustomerID match rate
SELECT 
    'CustomerID Match Rate' AS Check_Type,
    COUNT(*) AS TotalOrders,
    SUM(CASE WHEN CustomerID IS NOT NULL THEN 1 ELSE 0 END) AS Matched,
    CAST(100.0 * SUM(CASE WHEN CustomerID IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,2)) AS MatchPercent
FROM CustomerOrders;

-- Check segment distribution
SELECT 'Customer Segments' AS Check_Type, Segment, COUNT(*) AS CustomerCount
FROM Customers
WHERE Segment IS NOT NULL
GROUP BY Segment;

PRINT '';
PRINT '============================================================================';
PRINT 'ALL DONE! The database is ready for OrderHubNow.';
PRINT '============================================================================';
GO
