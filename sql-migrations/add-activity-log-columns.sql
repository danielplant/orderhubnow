-- Migration: Add columns to ActivityLogs for detailed audit trail
-- Date: 2026-01-15
-- Description: Extend ActivityLogs table with structured logging fields

-- Add new columns if they don't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ActivityLogs') AND name = 'EntityType')
BEGIN
  ALTER TABLE ActivityLogs ADD EntityType NVARCHAR(50);
  PRINT 'Added EntityType column';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ActivityLogs') AND name = 'EntityID')
BEGIN
  ALTER TABLE ActivityLogs ADD EntityID BIGINT;
  PRINT 'Added EntityID column';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ActivityLogs') AND name = 'Action')
BEGIN
  ALTER TABLE ActivityLogs ADD Action NVARCHAR(100);
  PRINT 'Added Action column';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ActivityLogs') AND name = 'OldValues')
BEGIN
  ALTER TABLE ActivityLogs ADD OldValues NVARCHAR(MAX);
  PRINT 'Added OldValues column';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ActivityLogs') AND name = 'NewValues')
BEGIN
  ALTER TABLE ActivityLogs ADD NewValues NVARCHAR(MAX);
  PRINT 'Added NewValues column';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ActivityLogs') AND name = 'PerformedBy')
BEGIN
  ALTER TABLE ActivityLogs ADD PerformedBy NVARCHAR(255);
  PRINT 'Added PerformedBy column';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ActivityLogs') AND name = 'IPAddress')
BEGIN
  ALTER TABLE ActivityLogs ADD IPAddress NVARCHAR(50);
  PRINT 'Added IPAddress column';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ActivityLogs') AND name = 'UserAgent')
BEGIN
  ALTER TABLE ActivityLogs ADD UserAgent NVARCHAR(500);
  PRINT 'Added UserAgent column';
END
GO

-- Create indexes for efficient querying
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ActivityLogs_EntityType' AND object_id = OBJECT_ID('ActivityLogs'))
BEGIN
  CREATE INDEX IX_ActivityLogs_EntityType ON ActivityLogs(EntityType, EntityID);
  PRINT 'Created IX_ActivityLogs_EntityType index';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ActivityLogs_Action' AND object_id = OBJECT_ID('ActivityLogs'))
BEGIN
  CREATE INDEX IX_ActivityLogs_Action ON ActivityLogs(Action);
  PRINT 'Created IX_ActivityLogs_Action index';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ActivityLogs_DateAdded' AND object_id = OBJECT_ID('ActivityLogs'))
BEGIN
  CREATE INDEX IX_ActivityLogs_DateAdded ON ActivityLogs(DateAdded DESC);
  PRINT 'Created IX_ActivityLogs_DateAdded index';
END
GO

PRINT 'ActivityLogs migration completed';
GO
