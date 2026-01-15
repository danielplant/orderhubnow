-- Auto-generated migration to sync production with local schema
-- Generated: Thu 15 Jan 2026 12:45:56 EST
-- Run this on production database before deploying

BEGIN TRY

BEGIN TRAN;

-- DropTable
DROP TABLE [dbo].[AuthTokens_Orphaned_Backup];

-- DropTable
DROP TABLE [dbo].[CustomerOrdersItems_Orphaned_Backup];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

-- Register this migration
IF NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE Name = '20260115-124556-auto-migration')
    INSERT INTO SchemaMigrations (Name) VALUES ('20260115-124556-auto-migration');
GO
