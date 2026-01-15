-- Migration: Add IsPreOrder column to CustomerOrders
-- Date: 2026-01-15
-- Purpose: Store whether an order is a pre-order explicitly instead of deriving from OrderNumber prefix

-- Step 1: Add the column (nullable initially for safe migration)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'IsPreOrder'
)
BEGIN
    ALTER TABLE CustomerOrders ADD IsPreOrder BIT NULL;
    PRINT 'Added IsPreOrder column to CustomerOrders';
END
ELSE
BEGIN
    PRINT 'IsPreOrder column already exists';
END
GO

-- Step 2: Backfill existing orders based on OrderNumber prefix
-- P prefix = Pre-Order (1), A prefix or other = ATS (0)
UPDATE CustomerOrders 
SET IsPreOrder = CASE 
    WHEN OrderNumber LIKE 'P%' THEN 1 
    ELSE 0 
END
WHERE IsPreOrder IS NULL;

PRINT 'Backfilled IsPreOrder for ' + CAST(@@ROWCOUNT AS VARCHAR) + ' orders';
GO

-- Step 3: Verify the migration
SELECT 
    'Pre-Orders' AS OrderType,
    COUNT(*) AS Count
FROM CustomerOrders 
WHERE IsPreOrder = 1
UNION ALL
SELECT 
    'ATS Orders' AS OrderType,
    COUNT(*) AS Count
FROM CustomerOrders 
WHERE IsPreOrder = 0;
GO
