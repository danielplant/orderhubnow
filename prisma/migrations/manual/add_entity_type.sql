-- Add EntityType column to ShopifySyncRun table
-- Run this manually via SQL client or tunnel

ALTER TABLE ShopifySyncRun
ADD EntityType NVARCHAR(20) DEFAULT 'product';
