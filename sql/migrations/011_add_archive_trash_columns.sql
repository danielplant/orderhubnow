-- Migration: Add archive and trash columns to CustomerOrders
-- Date: 2026-02-04
-- Purpose: Enable soft-delete and archiving functionality for orders

-- Add archive columns
ALTER TABLE CustomerOrders ADD ArchivedAt DATETIME NULL;
ALTER TABLE CustomerOrders ADD ArchivedBy NVARCHAR(255) NULL;

-- Add trash columns  
ALTER TABLE CustomerOrders ADD TrashedAt DATETIME NULL;
ALTER TABLE CustomerOrders ADD TrashedBy NVARCHAR(255) NULL;

-- NOTE: Indexes created in separate migration 012
