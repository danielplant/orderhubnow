-- Migration: Add indexes for archive/trash columns
-- Date: 2026-02-04
-- Note: Columns were added in migration 011, this adds the indexes separately

CREATE NONCLUSTERED INDEX IX_CustomerOrders_ArchivedAt 
ON CustomerOrders(ArchivedAt) WHERE ArchivedAt IS NOT NULL;

CREATE NONCLUSTERED INDEX IX_CustomerOrders_TrashedAt 
ON CustomerOrders(TrashedAt) WHERE TrashedAt IS NOT NULL;
