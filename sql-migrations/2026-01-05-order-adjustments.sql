-- ============================================================================
-- ORDER ADJUSTMENTS MIGRATION
-- ============================================================================
-- Purpose: Add fields for shipping costs, tracking, and shipped amounts
-- This enables admins to make order adjustments after the initial order
-- (similar to Faire workflow: enter shipping, tracking, adjust items)
--
-- Created: 2026-01-05
-- ============================================================================

PRINT '============================================================================';
PRINT 'ORDER ADJUSTMENTS MIGRATION - STARTING';
PRINT '============================================================================';
PRINT '';

-- ============================================================================
-- SECTION 1: ADD SHIPPING AND TRACKING FIELDS TO CustomerOrders
-- ============================================================================

PRINT 'SECTION 1: Adding shipping and tracking fields...';

-- Add ShippingCost column
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'ShippingCost'
)
BEGIN
    ALTER TABLE CustomerOrders ADD ShippingCost FLOAT NULL DEFAULT 0;
    PRINT 'Added ShippingCost column to CustomerOrders';
END
ELSE
BEGIN
    PRINT 'ShippingCost column already exists - skipping';
END
GO

-- Add TrackingNumber column
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'TrackingNumber'
)
BEGIN
    ALTER TABLE CustomerOrders ADD TrackingNumber NVARCHAR(200) NULL;
    PRINT 'Added TrackingNumber column to CustomerOrders';
END
ELSE
BEGIN
    PRINT 'TrackingNumber column already exists - skipping';
END
GO

-- Add ShippedAmount column (actual shipped value, may differ from OrderAmount)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'ShippedAmount'
)
BEGIN
    ALTER TABLE CustomerOrders ADD ShippedAmount FLOAT NULL;
    PRINT 'Added ShippedAmount column to CustomerOrders';
END
ELSE
BEGIN
    PRINT 'ShippedAmount column already exists - skipping';
END
GO

-- Add ShipDate column (actual ship date when order was shipped)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'ShipDate'
)
BEGIN
    ALTER TABLE CustomerOrders ADD ShipDate DATETIME NULL;
    PRINT 'Added ShipDate column to CustomerOrders';
END
ELSE
BEGIN
    PRINT 'ShipDate column already exists - skipping';
END
GO

-- Add InvoiceNumber column
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME = 'InvoiceNumber'
)
BEGIN
    ALTER TABLE CustomerOrders ADD InvoiceNumber NVARCHAR(100) NULL;
    PRINT 'Added InvoiceNumber column to CustomerOrders';
END
ELSE
BEGIN
    PRINT 'InvoiceNumber column already exists - skipping';
END
GO

PRINT 'SECTION 1: Complete.';
PRINT '';
GO

-- ============================================================================
-- SECTION 2: ADD SHIPPED QUANTITY TO LINE ITEMS
-- ============================================================================

PRINT 'SECTION 2: Adding shipped quantity to line items...';

-- Add ShippedQuantity column (actual qty shipped, may differ from Quantity ordered)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CustomerOrdersItems' AND COLUMN_NAME = 'ShippedQuantity'
)
BEGIN
    ALTER TABLE CustomerOrdersItems ADD ShippedQuantity INT NULL;
    PRINT 'Added ShippedQuantity column to CustomerOrdersItems';
END
ELSE
BEGIN
    PRINT 'ShippedQuantity column already exists - skipping';
END
GO

PRINT 'SECTION 2: Complete.';
PRINT '';
GO

-- ============================================================================
-- VALIDATION
-- ============================================================================

PRINT '============================================================================';
PRINT 'ORDER ADJUSTMENTS MIGRATION - VALIDATION';
PRINT '============================================================================';
PRINT '';

-- Check new columns exist
SELECT 'New CustomerOrders Columns' AS Check_Type, COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'CustomerOrders'
AND COLUMN_NAME IN ('ShippingCost', 'TrackingNumber', 'ShippedAmount', 'ShipDate', 'InvoiceNumber');

SELECT 'New CustomerOrdersItems Columns' AS Check_Type, COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'CustomerOrdersItems'
AND COLUMN_NAME = 'ShippedQuantity';

PRINT '';
PRINT '============================================================================';
PRINT 'ORDER ADJUSTMENTS MIGRATION COMPLETE';
PRINT '============================================================================';
GO
