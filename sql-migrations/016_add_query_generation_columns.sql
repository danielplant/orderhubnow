-- Migration: Add query generation columns to ShopifyFieldMapping
-- Purpose: Enable config-driven GraphQL query generation for sync services
-- Date: 2026-01-28

-- Add 7 new columns for query generation metadata
ALTER TABLE ShopifyFieldMapping ADD serviceName NVARCHAR(50) NULL;
ALTER TABLE ShopifyFieldMapping ADD metafieldNamespace NVARCHAR(100) NULL;
ALTER TABLE ShopifyFieldMapping ADD metafieldKey NVARCHAR(100) NULL;
ALTER TABLE ShopifyFieldMapping ADD paginationLimit INT NULL;
ALTER TABLE ShopifyFieldMapping ADD queryArguments NVARCHAR(500) NULL;
ALTER TABLE ShopifyFieldMapping ADD fieldType NVARCHAR(20) NOT NULL DEFAULT 'scalar';
ALTER TABLE ShopifyFieldMapping ADD sortOrder INT NULL;

-- Add index for service filtering
CREATE INDEX IX_ShopifyFieldMapping_serviceName ON ShopifyFieldMapping(serviceName);
