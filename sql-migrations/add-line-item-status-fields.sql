-- Migration: Add line item fulfillment status tracking fields
-- Date: 2026-01-15
-- Description: Adds Status, CancelledQty, CancelledReason, CancelledAt, and CancelledBy columns
--              to CustomerOrdersItems table for tracking line item fulfillment status.

-- Check if columns exist before adding
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrdersItems') AND name = 'Status')
BEGIN
    ALTER TABLE CustomerOrdersItems
    ADD Status NVARCHAR(20) DEFAULT 'Open';
    PRINT 'Added Status column to CustomerOrdersItems';
END
ELSE
    PRINT 'Status column already exists';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrdersItems') AND name = 'CancelledQty')
BEGIN
    ALTER TABLE CustomerOrdersItems
    ADD CancelledQty INT DEFAULT 0;
    PRINT 'Added CancelledQty column to CustomerOrdersItems';
END
ELSE
    PRINT 'CancelledQty column already exists';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrdersItems') AND name = 'CancelledReason')
BEGIN
    ALTER TABLE CustomerOrdersItems
    ADD CancelledReason NVARCHAR(100) NULL;
    PRINT 'Added CancelledReason column to CustomerOrdersItems';
END
ELSE
    PRINT 'CancelledReason column already exists';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrdersItems') AND name = 'CancelledAt')
BEGIN
    ALTER TABLE CustomerOrdersItems
    ADD CancelledAt DATETIME NULL;
    PRINT 'Added CancelledAt column to CustomerOrdersItems';
END
ELSE
    PRINT 'CancelledAt column already exists';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrdersItems') AND name = 'CancelledBy')
BEGIN
    ALTER TABLE CustomerOrdersItems
    ADD CancelledBy NVARCHAR(255) NULL;
    PRINT 'Added CancelledBy column to CustomerOrdersItems';
END
ELSE
    PRINT 'CancelledBy column already exists';
GO

-- Summary of changes:
-- Status: Track line item status (Open, Shipped, Cancelled)
-- CancelledQty: Number of units cancelled (supports partial cancellation)
-- CancelledReason: Reason for cancellation (Out of stock, Discontinued, Customer request, etc.)
-- CancelledAt: Timestamp when cancellation occurred
-- CancelledBy: User who performed the cancellation
