-- Feature Interest Tracking Table
-- Captures user interest and expectations for upcoming features

CREATE TABLE FeatureInterest (
  ID BIGINT IDENTITY(1,1) PRIMARY KEY,
  Feature NVARCHAR(100) NOT NULL,
  SelectedOptions NVARCHAR(MAX) NULL,
  FreeText NVARCHAR(MAX) NULL,
  OrderId BIGINT NULL,
  OrderNumber NVARCHAR(50) NULL,
  UserId NVARCHAR(255) NULL,
  CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
);

CREATE INDEX IX_FeatureInterest_Feature ON FeatureInterest(Feature);
CREATE INDEX IX_FeatureInterest_CreatedAt ON FeatureInterest(CreatedAt);
