-- Phase 3: Add PlannedShipments table and FK on CustomerOrdersItems
-- Run this migration to enable planned shipments feature

-- ============================================================================
-- Create PlannedShipments table
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PlannedShipments')
BEGIN
    CREATE TABLE [PlannedShipments] (
        [ID] BIGINT NOT NULL IDENTITY(1,1),
        [CustomerOrderID] BIGINT NOT NULL,
        [CollectionID] INT NULL,
        [CollectionName] NVARCHAR(500) NULL,
        [PlannedShipStart] DATETIME NOT NULL,
        [PlannedShipEnd] DATETIME NOT NULL,
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Planned',
        [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME NULL,
        CONSTRAINT [PK_PlannedShipment] PRIMARY KEY ([ID]),
        CONSTRAINT [FK_PlannedShipment_CustomerOrders] FOREIGN KEY ([CustomerOrderID]) 
            REFERENCES [CustomerOrders]([ID]) ON DELETE CASCADE
    );

    CREATE INDEX [IX_PlannedShipment_CustomerOrderID] ON [PlannedShipments]([CustomerOrderID]);
    CREATE INDEX [IX_PlannedShipment_Status] ON [PlannedShipments]([Status]);
    
    PRINT 'Created PlannedShipments table';
END
ELSE
BEGIN
    PRINT 'PlannedShipments table already exists';
END
GO

-- ============================================================================
-- Add PlannedShipmentID column to CustomerOrdersItems
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrdersItems') AND name = 'PlannedShipmentID')
BEGIN
    ALTER TABLE [CustomerOrdersItems] ADD [PlannedShipmentID] BIGINT NULL;
    
    ALTER TABLE [CustomerOrdersItems] ADD CONSTRAINT [FK_CustomerOrdersItems_PlannedShipment] 
        FOREIGN KEY ([PlannedShipmentID]) REFERENCES [PlannedShipments]([ID]) ON DELETE SET NULL;
    
    CREATE INDEX [IX_CustomerOrdersItems_PlannedShipmentID] ON [CustomerOrdersItems]([PlannedShipmentID]);
    
    PRINT 'Added PlannedShipmentID column to CustomerOrdersItems';
END
ELSE
BEGIN
    PRINT 'PlannedShipmentID column already exists on CustomerOrdersItems';
END
GO

-- ============================================================================
-- Phase 6: Add PlannedShipmentID to Shipments for fulfillment linking
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Shipments') AND name = 'PlannedShipmentID')
BEGIN
    ALTER TABLE [Shipments] ADD [PlannedShipmentID] BIGINT NULL;
    
    ALTER TABLE [Shipments] ADD CONSTRAINT [FK_Shipments_PlannedShipment] 
        FOREIGN KEY ([PlannedShipmentID]) REFERENCES [PlannedShipments]([ID]) ON DELETE SET NULL;
    
    CREATE INDEX [IX_Shipments_PlannedShipmentID] ON [Shipments]([PlannedShipmentID]);
    
    PRINT 'Added PlannedShipmentID column to Shipments';
END
ELSE
BEGIN
    PRINT 'PlannedShipmentID column already exists on Shipments';
END
GO
