-- Auto-generated migration to sync production with local schema
-- Generated: Thu 15 Jan 2026 16:27:35 EST
-- Run this on production database before deploying

BEGIN TRY

BEGIN TRAN;

-- DropTable
DROP TABLE [dbo].[Sku_backup_2026_01_15_18_0];

-- DropTable
DROP TABLE [dbo].[Sku_backup_2026_01_15_18_4];

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
IF NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE Name = '20260115-162735-auto-migration')
    INSERT INTO SchemaMigrations (Name) VALUES ('20260115-162735-auto-migration');
GO
