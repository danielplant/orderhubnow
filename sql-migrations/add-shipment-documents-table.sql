-- Migration: Add ShipmentDocuments table for professional document storage
-- Date: 2026-01-15
-- Description: Store generated PDFs (packing slips, invoices) with metadata

-- Create ShipmentDocuments table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ShipmentDocuments' AND xtype='U')
BEGIN
  CREATE TABLE ShipmentDocuments (
    ID BIGINT IDENTITY(1,1) PRIMARY KEY,
    ShipmentID BIGINT NOT NULL,
    OrderID BIGINT NOT NULL,
    DocumentType NVARCHAR(50) NOT NULL,  -- 'packing_slip', 'shipping_invoice'
    DocumentNumber NVARCHAR(100) NOT NULL, -- 'PS-A10001-1', 'INV-A10001-1'
    FileName NVARCHAR(255) NOT NULL,
    FilePath NVARCHAR(500) NOT NULL,  -- S3 key or local path
    FileSize INT,
    MimeType NVARCHAR(100) DEFAULT 'application/pdf',
    GeneratedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    GeneratedBy NVARCHAR(255),
    SentToCustomer BIT DEFAULT 0,
    SentAt DATETIME2,
    CONSTRAINT FK_ShipmentDocuments_Shipment FOREIGN KEY (ShipmentID) 
      REFERENCES Shipments(ID) ON DELETE CASCADE,
    CONSTRAINT FK_ShipmentDocuments_Order FOREIGN KEY (OrderID) 
      REFERENCES CustomerOrders(ID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_ShipmentDocuments_ShipmentID ON ShipmentDocuments(ShipmentID);
  CREATE INDEX IX_ShipmentDocuments_OrderID ON ShipmentDocuments(OrderID);
  CREATE INDEX IX_ShipmentDocuments_DocumentNumber ON ShipmentDocuments(DocumentNumber);
  CREATE INDEX IX_ShipmentDocuments_DocumentType ON ShipmentDocuments(DocumentType);

  PRINT 'Created ShipmentDocuments table with indexes';
END
ELSE
BEGIN
  PRINT 'ShipmentDocuments table already exists';
END
GO
