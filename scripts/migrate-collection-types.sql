-- Migration script: Convert Collection.Type from 'ATS'/'PreOrder' to 'ats'/'preorder_no_po'/'preorder_po'
-- Run this BEFORE deploying the new code, via your DB tunnel

-- Step 1: Update existing ATS collections
UPDATE Collection SET Type = 'ats' WHERE Type = 'ATS';

-- Step 2: Update existing PreOrder collections to "No PO Yet" 
-- Admin will manually promote collections to 'preorder_po' after deployment
UPDATE Collection SET Type = 'preorder_no_po' WHERE Type = 'PreOrder';

-- Verify the migration
SELECT Type, COUNT(*) as Count FROM Collection GROUP BY Type;
