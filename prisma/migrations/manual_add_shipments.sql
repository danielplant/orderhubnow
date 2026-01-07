-- Migration: Add Shipments, ShipmentItems, ShipmentTracking tables
-- Generated for: Faire-Style Shipping & Invoicing feature
-- Date: 2026-01-06
--
-- IMPORTANT: Review and run this on the production database
-- Backup the database before running this migration

-- Add ShopifyOrderID column to CustomerOrders (for Shopify fulfillment sync)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CustomerOrders') AND name = 'ShopifyOrderID')
BEGIN
    ALTER TABLE [dbo].[CustomerOrders] ADD [ShopifyOrderID] NVARCHAR(50) NULL;
    PRINT 'Added ShopifyOrderID column to CustomerOrders';
END
GO

-- Create Shipments table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.Shipments') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[Shipments] (
        [ID] BIGINT IDENTITY(1,1) NOT NULL,
        [CustomerOrderID] BIGINT NOT NULL,
        [ShippedSubtotal] FLOAT NOT NULL DEFAULT 0,
        [ShippingCost] FLOAT NOT NULL DEFAULT 0,
        [ShippedTotal] FLOAT NOT NULL DEFAULT 0,
        [ShipDate] DATETIME NULL,
        [InternalNotes] NVARCHAR(MAX) NULL,
        [CreatedBy] NVARCHAR(255) NOT NULL,
        [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME NULL,
        [ShopifyFulfillmentID] NVARCHAR(50) NULL,
        CONSTRAINT [PK_Shipments] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_Shipments_CustomerOrders] FOREIGN KEY ([CustomerOrderID])
            REFERENCES [dbo].[CustomerOrders]([ID]) ON UPDATE NO ACTION
    );

    CREATE INDEX [IX_Shipments_CustomerOrderID] ON [dbo].[Shipments]([CustomerOrderID]);
    PRINT 'Created Shipments table';
END
GO

-- Create ShipmentItems table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.ShipmentItems') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[ShipmentItems] (
        [ID] BIGINT IDENTITY(1,1) NOT NULL,
        [ShipmentID] BIGINT NOT NULL,
        [OrderItemID] BIGINT NOT NULL,
        [QuantityShipped] INT NOT NULL,
        [PriceOverride] FLOAT NULL,
        CONSTRAINT [PK_ShipmentItems] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_ShipmentItems_Shipments] FOREIGN KEY ([ShipmentID])
            REFERENCES [dbo].[Shipments]([ID]) ON UPDATE NO ACTION,
        CONSTRAINT [FK_ShipmentItems_CustomerOrdersItems] FOREIGN KEY ([OrderItemID])
            REFERENCES [dbo].[CustomerOrdersItems]([ID]) ON UPDATE NO ACTION
    );

    CREATE INDEX [IX_ShipmentItems_ShipmentID] ON [dbo].[ShipmentItems]([ShipmentID]);
    CREATE INDEX [IX_ShipmentItems_OrderItemID] ON [dbo].[ShipmentItems]([OrderItemID]);
    PRINT 'Created ShipmentItems table';
END
GO

-- Create ShipmentTracking table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.ShipmentTracking') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[ShipmentTracking] (
        [ID] BIGINT IDENTITY(1,1) NOT NULL,
        [ShipmentID] BIGINT NOT NULL,
        [Carrier] NVARCHAR(50) NOT NULL,
        [TrackingNumber] NVARCHAR(100) NOT NULL,
        [AddedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT [PK_ShipmentTracking] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_ShipmentTracking_Shipments] FOREIGN KEY ([ShipmentID])
            REFERENCES [dbo].[Shipments]([ID]) ON UPDATE NO ACTION
    );

    CREATE INDEX [IX_ShipmentTracking_ShipmentID] ON [dbo].[ShipmentTracking]([ShipmentID]);
    PRINT 'Created ShipmentTracking table';
END
GO

-- Add index on CustomerOrdersItems.CustomerOrderID if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerOrdersItems_CustomerOrderID' AND object_id = OBJECT_ID('dbo.CustomerOrdersItems'))
BEGIN
    CREATE INDEX [IX_CustomerOrdersItems_CustomerOrderID] ON [dbo].[CustomerOrdersItems]([CustomerOrderID]);
    PRINT 'Created index IX_CustomerOrdersItems_CustomerOrderID';
END
GO

PRINT 'Migration complete: Shipments tables created successfully';
