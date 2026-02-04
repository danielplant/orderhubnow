-- Create CalculatedField table for user-defined formulas
CREATE TABLE CalculatedField (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(50) NOT NULL,
    Formula NVARCHAR(500) NOT NULL,
    Description NVARCHAR(500) NULL,
    IsSystem BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_CalculatedField_Name UNIQUE (Name)
);

-- Insert system calculated field for net_po
INSERT INTO CalculatedField (Name, Formula, Description, IsSystem, CreatedAt, UpdatedAt)
VALUES ('net_po', 'incoming - committed', 'Remaining units from factory PO', 1, GETUTCDATE(), GETUTCDATE());
