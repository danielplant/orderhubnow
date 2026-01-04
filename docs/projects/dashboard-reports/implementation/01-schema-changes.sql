-- ============================================================================
-- PHASE 1: Schema Changes for Analytics Platform
-- ============================================================================
-- CRITICAL: These changes unlock Reports 3-9
-- Run in order. Each section is idempotent (safe to re-run).
-- ============================================================================

-- ============================================================================
-- STEP 1: Add Foreign Key columns to CustomerOrders
-- ============================================================================

-- Add CustomerID column if not exists
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'CustomerID'
)
BEGIN
    ALTER TABLE CustomerOrders ADD CustomerID INT NULL;
    PRINT 'Added CustomerID column to CustomerOrders';
END
GO

-- Add RepID column if not exists
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'RepID'
)
BEGIN
    ALTER TABLE CustomerOrders ADD RepID INT NULL;
    PRINT 'Added RepID column to CustomerOrders';
END
GO

-- ============================================================================
-- STEP 2: Backfill CustomerID by matching StoreName
-- ============================================================================

-- First, let's see the match rate before updating
PRINT 'Checking CustomerID match rate...';
SELECT 
    COUNT(*) AS TotalOrders,
    SUM(CASE WHEN c.ID IS NOT NULL THEN 1 ELSE 0 END) AS Matched,
    CAST(100.0 * SUM(CASE WHEN c.ID IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,2)) AS MatchPercent
FROM CustomerOrders co
LEFT JOIN Customers c ON LOWER(TRIM(co.StoreName)) = LOWER(TRIM(c.StoreName))
WHERE co.CustomerID IS NULL;

-- Run the backfill
UPDATE co
SET co.CustomerID = c.ID
FROM CustomerOrders co
INNER JOIN Customers c ON LOWER(TRIM(co.StoreName)) = LOWER(TRIM(c.StoreName))
WHERE co.CustomerID IS NULL;

PRINT 'CustomerID backfill complete';
GO

-- ============================================================================
-- STEP 3: Backfill RepID by matching SalesRep name
-- ============================================================================

-- Check match rate
PRINT 'Checking RepID match rate...';
SELECT 
    COUNT(*) AS TotalOrders,
    SUM(CASE WHEN r.ID IS NOT NULL THEN 1 ELSE 0 END) AS Matched,
    CAST(100.0 * SUM(CASE WHEN r.ID IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,2)) AS MatchPercent
FROM CustomerOrders co
LEFT JOIN Reps r ON LOWER(TRIM(co.SalesRep)) = LOWER(TRIM(r.Name))
WHERE co.RepID IS NULL AND co.SalesRep IS NOT NULL AND co.SalesRep <> '';

-- Run the backfill
UPDATE co
SET co.RepID = r.ID
FROM CustomerOrders co
INNER JOIN Reps r ON LOWER(TRIM(co.SalesRep)) = LOWER(TRIM(r.Name))
WHERE co.RepID IS NULL;

PRINT 'RepID backfill complete';
GO

-- ============================================================================
-- STEP 4: Add analytics fields to Customers table
-- ============================================================================

-- FirstOrderDate
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'FirstOrderDate'
)
BEGIN
    ALTER TABLE Customers ADD FirstOrderDate DATETIME NULL;
    PRINT 'Added FirstOrderDate column to Customers';
END
GO

-- LTV (Lifetime Value)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'LTV'
)
BEGIN
    ALTER TABLE Customers ADD LTV DECIMAL(18,2) NULL;
    PRINT 'Added LTV column to Customers';
END
GO

-- Segment (Platinum/Gold/Silver/Bronze)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'Segment'
)
BEGIN
    ALTER TABLE Customers ADD Segment NVARCHAR(20) NULL;
    PRINT 'Added Segment column to Customers';
END
GO

-- UsualOrderCycle (average days between orders)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'UsualOrderCycle'
)
BEGIN
    ALTER TABLE Customers ADD UsualOrderCycle INT NULL;
    PRINT 'Added UsualOrderCycle column to Customers';
END
GO

-- LastOrderDate
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'LastOrderDate'
)
BEGIN
    ALTER TABLE Customers ADD LastOrderDate DATETIME NULL;
    PRINT 'Added LastOrderDate column to Customers';
END
GO

-- OrderCount
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'OrderCount'
)
BEGIN
    ALTER TABLE Customers ADD OrderCount INT NULL DEFAULT 0;
    PRINT 'Added OrderCount column to Customers';
END
GO

-- EstimatedPotential (for shareOfPotential calculation)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'EstimatedPotential'
)
BEGIN
    ALTER TABLE Customers ADD EstimatedPotential DECIMAL(18,2) NULL;
    PRINT 'Added EstimatedPotential column to Customers';
END
GO

-- ============================================================================
-- STEP 5: Add Territory field to Reps table
-- ============================================================================

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Reps' AND COLUMN_NAME = 'Territory'
)
BEGIN
    ALTER TABLE Reps ADD Territory NVARCHAR(100) NULL;
    PRINT 'Added Territory column to Reps';
END
GO

-- ============================================================================
-- STEP 6: Create RepTargets table
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RepTargets')
BEGIN
    CREATE TABLE RepTargets (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        RepID INT NOT NULL,
        PeriodType NVARCHAR(20) NOT NULL, -- 'Monthly', 'Quarterly', 'Annual'
        PeriodStart DATETIME NOT NULL,
        TargetAmount DECIMAL(18,2) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NULL,
        CONSTRAINT FK_RepTargets_Reps FOREIGN KEY (RepID) REFERENCES Reps(ID)
    );
    
    CREATE INDEX IX_RepTargets_RepID ON RepTargets(RepID);
    CREATE INDEX IX_RepTargets_Period ON RepTargets(PeriodType, PeriodStart);
    
    PRINT 'Created RepTargets table';
END
GO

-- ============================================================================
-- STEP 7: Populate Customer analytics fields
-- ============================================================================

-- Update FirstOrderDate, LastOrderDate, OrderCount, and LTV
WITH CustomerStats AS (
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

PRINT 'Updated Customer analytics fields (FirstOrderDate, LastOrderDate, OrderCount, LTV)';
GO

-- Calculate UsualOrderCycle (average days between orders for customers with 2+ orders)
WITH OrderDiffs AS (
    SELECT 
        CustomerID,
        OrderDate,
        LAG(OrderDate) OVER (PARTITION BY CustomerID ORDER BY OrderDate) AS PrevOrderDate
    FROM CustomerOrders
    WHERE CustomerID IS NOT NULL
),
AvgCycles AS (
    SELECT 
        CustomerID,
        AVG(DATEDIFF(day, PrevOrderDate, OrderDate)) AS AvgDays
    FROM OrderDiffs
    WHERE PrevOrderDate IS NOT NULL
    GROUP BY CustomerID
)
UPDATE c
SET c.UsualOrderCycle = ac.AvgDays
FROM Customers c
INNER JOIN AvgCycles ac ON ac.CustomerID = c.ID;

PRINT 'Updated UsualOrderCycle for customers';
GO

-- Set Segment based on LTV
UPDATE Customers
SET Segment = CASE
    WHEN LTV >= 100000 THEN 'Platinum'
    WHEN LTV >= 50000 THEN 'Gold'
    WHEN LTV >= 20000 THEN 'Silver'
    ELSE 'Bronze'
END
WHERE LTV IS NOT NULL;

PRINT 'Updated Customer Segments based on LTV';
GO

-- Populate EstimatedPotential (75th percentile of segment peers, or 1.5x LTV)
-- Using IIF for SQL Server 2019 compatibility (not GREATEST)
;WITH SegmentPercentiles AS (
    SELECT DISTINCT
        Segment,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY LTV) OVER (PARTITION BY Segment) AS P75
    FROM Customers
    WHERE LTV > 0 AND Segment IS NOT NULL
)
UPDATE c
SET c.EstimatedPotential = IIF(c.LTV * 1.5 > sp.P75, c.LTV * 1.5, sp.P75)
FROM Customers c
INNER JOIN SegmentPercentiles sp ON sp.Segment = c.Segment
WHERE c.LTV > 0;

-- For customers with no LTV, set a minimum potential
UPDATE Customers
SET EstimatedPotential = 5000
WHERE EstimatedPotential IS NULL AND LTV IS NULL;

PRINT 'Updated EstimatedPotential for customers';
GO

-- ============================================================================
-- STEP 8: Create indexes for analytics queries
-- ============================================================================

-- Index for CustomerOrders FK lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerOrders_CustomerID')
BEGIN
    CREATE INDEX IX_CustomerOrders_CustomerID ON CustomerOrders(CustomerID);
    PRINT 'Created index IX_CustomerOrders_CustomerID';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerOrders_RepID')
BEGIN
    CREATE INDEX IX_CustomerOrders_RepID ON CustomerOrders(RepID);
    PRINT 'Created index IX_CustomerOrders_RepID';
END
GO

-- Index for date-based queries
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerOrders_OrderDate')
BEGIN
    CREATE INDEX IX_CustomerOrders_OrderDate ON CustomerOrders(OrderDate);
    PRINT 'Created index IX_CustomerOrders_OrderDate';
END
GO

-- Index for Customer analytics
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_Segment')
BEGIN
    CREATE INDEX IX_Customers_Segment ON Customers(Segment);
    PRINT 'Created index IX_Customers_Segment';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_LastOrderDate')
BEGIN
    CREATE INDEX IX_Customers_LastOrderDate ON Customers(LastOrderDate);
    PRINT 'Created index IX_Customers_LastOrderDate';
END
GO

-- ============================================================================
-- STEP 9: Validation
-- ============================================================================

PRINT '============================================';
PRINT 'VALIDATION RESULTS';
PRINT '============================================';

-- CustomerID match rate
SELECT 
    'CustomerID FK' AS Metric,
    COUNT(*) AS TotalOrders,
    SUM(CASE WHEN CustomerID IS NOT NULL THEN 1 ELSE 0 END) AS Matched,
    CAST(100.0 * SUM(CASE WHEN CustomerID IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,2)) AS MatchPercent
FROM CustomerOrders;

-- RepID match rate
SELECT 
    'RepID FK' AS Metric,
    COUNT(*) AS TotalOrders,
    SUM(CASE WHEN RepID IS NOT NULL THEN 1 ELSE 0 END) AS Matched,
    CAST(100.0 * SUM(CASE WHEN RepID IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,2)) AS MatchPercent
FROM CustomerOrders
WHERE SalesRep IS NOT NULL AND SalesRep <> '';

-- Customer Segment distribution
SELECT 
    Segment,
    COUNT(*) AS CustomerCount,
    SUM(COALESCE(LTV, 0)) AS TotalLTV,
    SUM(COALESCE(EstimatedPotential, 0)) AS TotalPotential
FROM Customers
WHERE Segment IS NOT NULL
GROUP BY Segment
ORDER BY 
    CASE Segment 
        WHEN 'Platinum' THEN 1 
        WHEN 'Gold' THEN 2 
        WHEN 'Silver' THEN 3 
        ELSE 4 
    END;

-- EstimatedPotential coverage
SELECT 
    'EstimatedPotential' AS Metric,
    COUNT(*) AS TotalCustomers,
    SUM(CASE WHEN EstimatedPotential IS NOT NULL THEN 1 ELSE 0 END) AS WithPotential,
    CAST(100.0 * SUM(CASE WHEN EstimatedPotential IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,2)) AS CoveragePercent
FROM Customers;

PRINT 'Schema changes complete!';
GO
