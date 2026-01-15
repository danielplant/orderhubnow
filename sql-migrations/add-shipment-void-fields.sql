-- Add void fields to Shipments table
-- Allows marking shipments as voided without deleting them (preserves audit trail)

ALTER TABLE Shipments ADD VoidedAt DATETIME NULL;
ALTER TABLE Shipments ADD VoidedBy NVARCHAR(255) NULL;
ALTER TABLE Shipments ADD VoidReason NVARCHAR(100) NULL;
ALTER TABLE Shipments ADD VoidNotes NVARCHAR(MAX) NULL;

-- Index for filtering voided shipments
CREATE INDEX IX_Shipments_VoidedAt ON Shipments(VoidedAt);
