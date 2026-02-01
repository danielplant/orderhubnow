-- Manual migration: Add PlannedShipmentID to ShipmentItems
-- This enables per-item tracking of which PlannedShipment each fulfilled item came from
-- Required for accurate cross-shipment fulfillment tracking

-- Add PlannedShipmentID column to ShipmentItems
ALTER TABLE ShipmentItems
ADD PlannedShipmentID BIGINT NULL;

-- Add foreign key constraint
ALTER TABLE ShipmentItems
ADD CONSTRAINT FK_ShipmentItems_PlannedShipment
FOREIGN KEY (PlannedShipmentID) REFERENCES PlannedShipments(ID);

-- Add index for performance
CREATE INDEX IX_ShipmentItems_PlannedShipmentID
ON ShipmentItems(PlannedShipmentID);
