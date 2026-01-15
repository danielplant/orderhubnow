-- ============================================================================
-- Fix ShipmentDocuments Constraints
-- ============================================================================
-- This migration fixes the default constraints on ShipmentDocuments table
-- that prevent Prisma from altering columns.
--
-- Run this ONLY on local Docker database before prisma db push.
-- DO NOT run on production - production uses the deploy workflow.
-- ============================================================================

-- Drop default constraints on ShipmentDocuments
-- SQL Server creates default constraints with auto-generated names like DF__ShipmentD__Gener__XXXXX
-- We need to find and drop them dynamically

-- Drop GeneratedAt default constraint
DECLARE @constraintName1 NVARCHAR(128)
SELECT @constraintName1 = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'ShipmentDocuments' AND c.name = 'GeneratedAt'

IF @constraintName1 IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [ShipmentDocuments] DROP CONSTRAINT [' + @constraintName1 + ']')
    PRINT 'Dropped constraint: ' + @constraintName1
END
ELSE
    PRINT 'No default constraint found on GeneratedAt'

-- Drop MimeType default constraint
DECLARE @constraintName2 NVARCHAR(128)
SELECT @constraintName2 = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'ShipmentDocuments' AND c.name = 'MimeType'

IF @constraintName2 IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [ShipmentDocuments] DROP CONSTRAINT [' + @constraintName2 + ']')
    PRINT 'Dropped constraint: ' + @constraintName2
END
ELSE
    PRINT 'No default constraint found on MimeType'

-- Drop SentToCustomer default constraint
DECLARE @constraintName3 NVARCHAR(128)
SELECT @constraintName3 = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'ShipmentDocuments' AND c.name = 'SentToCustomer'

IF @constraintName3 IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [ShipmentDocuments] DROP CONSTRAINT [' + @constraintName3 + ']')
    PRINT 'Dropped constraint: ' + @constraintName3
END
ELSE
    PRINT 'No default constraint found on SentToCustomer'

-- Drop SentAt default constraint (if any)
DECLARE @constraintName4 NVARCHAR(128)
SELECT @constraintName4 = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE OBJECT_NAME(dc.parent_object_id) = 'ShipmentDocuments' AND c.name = 'SentAt'

IF @constraintName4 IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [ShipmentDocuments] DROP CONSTRAINT [' + @constraintName4 + ']')
    PRINT 'Dropped constraint: ' + @constraintName4
END
ELSE
    PRINT 'No default constraint found on SentAt'

PRINT 'Done dropping ShipmentDocuments default constraints. Now run: npx prisma db push'
