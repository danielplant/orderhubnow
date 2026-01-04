-- ============================================================
-- Script: Grant Write Permissions to limeappleNext
-- Database: Limeapple_Live_Nov2024
-- Purpose: Enable INSERT/UPDATE/DELETE for new web application
-- Run: AFTER deployment is verified working with read-only access
-- ============================================================

GRANT INSERT, UPDATE, DELETE ON Sku TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON Customers TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON CustomerOrders TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON CustomerOrdersComments TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON MissingShopifySkus TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON RawSkusFromShopify TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON ShopifySyncRun TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON CustomersFromShopify TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON SkuCategories TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON SkuMainCategory TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON SkuMainSubRship TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON Reps TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON Users TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON PPSizes TO limeappleNext;
GRANT INSERT, UPDATE, DELETE ON InventorySettings TO limeappleNext;

PRINT 'Write permissions granted to limeappleNext';

-- ============================================================
-- End of script
-- ============================================================
