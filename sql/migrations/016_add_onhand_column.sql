-- Add OnHand column to store Shopify's actual on_hand quantity
-- Previously only inventoryQuantity (available = on_hand - committed) was synced,
-- causing double-subtraction in warehouse_available formula.
ALTER TABLE RawSkusInventoryLevelFromShopify ADD OnHand INT NULL;
