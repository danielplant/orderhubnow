-- Availability Settings (Matrix Configuration)
-- Stores scenario-by-view availability rules and On Route visibility/labels

IF NOT EXISTS (
  SELECT *
  FROM sys.objects
  WHERE object_id = OBJECT_ID(N'[dbo].[AvailabilitySettings]') AND type in (N'U')
)
BEGIN
    CREATE TABLE [dbo].[AvailabilitySettings] (
        [ID]                    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [MatrixConfig]          NVARCHAR(MAX) NOT NULL,
        [ShowOnRouteProducts]   BIT NOT NULL DEFAULT 0,
        [ShowOnRouteInventory]  BIT NOT NULL DEFAULT 0,
        [ShowOnRouteXlsx]       BIT NOT NULL DEFAULT 0,
        [ShowOnRoutePdf]        BIT NOT NULL DEFAULT 0,
        [OnRouteLabelProducts]  NVARCHAR(100) NOT NULL DEFAULT 'On Route',
        [OnRouteLabelInventory] NVARCHAR(100) NOT NULL DEFAULT 'On Route',
        [OnRouteLabelXlsx]      NVARCHAR(100) NOT NULL DEFAULT 'On Route',
        [OnRouteLabelPdf]       NVARCHAR(100) NOT NULL DEFAULT 'On Route',
        [UpdatedAt]             DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedBy]             NVARCHAR(255) NULL
    );

    PRINT 'Created AvailabilitySettings table';
END
ELSE
BEGIN
    PRINT 'AvailabilitySettings table already exists';
END
GO
