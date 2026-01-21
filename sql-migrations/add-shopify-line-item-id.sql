-- Add ShopifyLineItemID to CustomerOrdersItems for precise fulfillment mapping
-- This field stores the Shopify line_item.id returned when an order is transferred to Shopify
-- Used during fulfillment back-sync to map Shopify fulfillment line items to OHN order items

-- Check if column already exists before adding
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('CustomerOrdersItems') 
    AND name = 'ShopifyLineItemID'
)
BEGIN
    ALTER TABLE CustomerOrdersItems 
    ADD ShopifyLineItemID NVARCHAR(50) NULL;
    
    PRINT 'Added ShopifyLineItemID column to CustomerOrdersItems';
END
ELSE
BEGIN
    PRINT 'ShopifyLineItemID column already exists on CustomerOrdersItems';
END
GO

-- Create filtered index for efficient lookups during fulfillment sync
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_CustomerOrdersItems_ShopifyLineItemID' 
    AND object_id = OBJECT_ID('CustomerOrdersItems')
)
BEGIN
    CREATE INDEX IX_CustomerOrdersItems_ShopifyLineItemID 
    ON CustomerOrdersItems(ShopifyLineItemID) 
    WHERE ShopifyLineItemID IS NOT NULL;
    
    PRINT 'Created index IX_CustomerOrdersItems_ShopifyLineItemID';
END
ELSE
BEGIN
    PRINT 'Index IX_CustomerOrdersItems_ShopifyLineItemID already exists';
END
GO
