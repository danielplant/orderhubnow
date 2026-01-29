-- Backfill EntityType for existing ShopifySyncRun records
-- The column was added with DEFAULT 'product' but existing rows have NULL

UPDATE ShopifySyncRun
SET EntityType = 'product'
WHERE EntityType IS NULL;
