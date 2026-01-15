-- Migration: Seed existing migrations into SchemaMigrations table
-- Date: 2026-01-15
--
-- This records migrations that are already applied to production.
-- Run this AFTER 000-schema-migrations-table.sql

INSERT INTO SchemaMigrations (Name) 
SELECT name FROM (VALUES 
    ('2026-01-04-OHN-migration'),
    ('add-product-type-column'),
    ('manual_add_collections'),
    ('manual_add_shipments'),
    ('001-seed-existing-migrations')
) AS migrations(name)
WHERE NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE Name = migrations.name);
GO

PRINT 'Seeded existing migrations into SchemaMigrations table';
