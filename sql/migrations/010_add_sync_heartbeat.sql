-- Migration: Add LastHeartbeat column to ShopifySyncRun for detecting dead processes
-- This column is updated periodically during sync processing
-- If LastHeartbeat is stale (> 2 minutes) and Status='started', the process is considered dead

ALTER TABLE ShopifySyncRun ADD LastHeartbeat DATETIME NULL;

-- Add comment for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Updated during processing to detect dead processes. If stale (>2 min) and Status=started, process is dead.',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'ShopifySyncRun',
    @level2type = N'COLUMN', @level2name = N'LastHeartbeat';

-- Track migration
INSERT INTO SchemaMigrations (Name, AppliedAt) VALUES ('010_add_sync_heartbeat', GETDATE());
