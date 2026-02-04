-- Seed default display rules (3 scenarios x 9 views = 27 rows)
-- Note: [View] is escaped because VIEW is a reserved keyword in SQL Server
-- ATS scenario: show on_hand
INSERT INTO DisplayRule (Scenario, [View], FieldSource, Label, RowBehavior, CreatedAt, UpdatedAt) VALUES
('ats', 'admin_products', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('ats', 'admin_inventory', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('ats', 'admin_modal', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('ats', 'buyer_ats', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('ats', 'buyer_preorder', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('ats', 'rep_ats', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('ats', 'rep_preorder', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('ats', 'xlsx', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('ats', 'pdf', 'on_hand', 'Available', 'show', GETUTCDATE(), GETUTCDATE());

-- PreOrder PO scenario: show net_po (incoming - committed)
INSERT INTO DisplayRule (Scenario, [View], FieldSource, Label, RowBehavior, CreatedAt, UpdatedAt) VALUES
('preorder_po', 'admin_products', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_po', 'admin_inventory', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_po', 'admin_modal', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_po', 'buyer_ats', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_po', 'buyer_preorder', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_po', 'rep_ats', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_po', 'rep_preorder', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_po', 'xlsx', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_po', 'pdf', 'net_po', 'Available', 'show', GETUTCDATE(), GETUTCDATE());

-- PreOrder No PO scenario: show blank (unlimited ordering)
INSERT INTO DisplayRule (Scenario, [View], FieldSource, Label, RowBehavior, CreatedAt, UpdatedAt) VALUES
('preorder_no_po', 'admin_products', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_no_po', 'admin_inventory', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_no_po', 'admin_modal', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_no_po', 'buyer_ats', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_no_po', 'buyer_preorder', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_no_po', 'rep_ats', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_no_po', 'rep_preorder', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_no_po', 'xlsx', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE()),
('preorder_no_po', 'pdf', '(blank)', '', 'show', GETUTCDATE(), GETUTCDATE());
