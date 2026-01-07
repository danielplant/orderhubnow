-- Migration: Add ProductType column to RawSkusFromShopify and Sku tables
-- This enables filtering products by category (e.g., Leggings, T-Shirts, Hoodies)
-- Date: 2026-01-07

-- Add ProductType to RawSkusFromShopify (staging table from Shopify sync)
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'RawSkusFromShopify' AND COLUMN_NAME = 'ProductType'
)
BEGIN
  ALTER TABLE RawSkusFromShopify ADD ProductType NVARCHAR(200) NULL;
  PRINT 'Added ProductType column to RawSkusFromShopify';
END
ELSE
BEGIN
  PRINT 'ProductType column already exists in RawSkusFromShopify';
END
GO

-- Add ProductType to Sku (main product table)
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'Sku' AND COLUMN_NAME = 'ProductType'
)
BEGIN
  ALTER TABLE Sku ADD ProductType NVARCHAR(200) NULL;
  PRINT 'Added ProductType column to Sku';
END
ELSE
BEGIN
  PRINT 'ProductType column already exists in Sku';
END
GO
