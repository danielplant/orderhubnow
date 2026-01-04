# SQL Migrations for OrderHubNow

## Overview

These SQL scripts must be run against the production database (`Limeapple_Live_Nov2024`) before the OrderHubNow application can fully function. They add required schema changes, create new tables, and grant necessary permissions.

**Database:** Limeapple_Live_Nov2024  
**Server:** 3.141.136.218:1433  
**User:** limeappleNext

## Background

The OrderHubNow Next.js application replaces the legacy .NET WebForms inventory system. The existing database schema was designed for the .NET app and lacks:

1. **Foreign key relationships** - Orders reference customers/reps by name strings, not IDs
2. **Analytics fields** - No LTV, segment, order cycle data on customers
3. **New tables** - ShopifySyncRun for tracking Shopify bulk operations, AliasSignals for learning entity aliases
4. **Write permissions** - The `limeappleNext` database user only has SELECT access

These scripts bridge that gap.

---

## Scripts (Run in Order)

### 1. `01-schema-changes.sql`
**Purpose:** Core schema changes for analytics and reporting

**What it does:**
- Adds `CustomerID` and `RepID` foreign key columns to `CustomerOrders`
- Backfills these FKs by matching `StoreName` and `SalesRep` text fields
- Adds analytics columns to `Customers`: `FirstOrderDate`, `LastOrderDate`, `LTV`, `Segment`, `UsualOrderCycle`, `OrderCount`, `EstimatedPotential`
- Adds `Territory` column to `Reps`
- Creates `RepTargets` table for sales targets
- Populates all analytics fields
- Creates performance indexes

**Idempotent:** Yes - safe to re-run (uses IF NOT EXISTS checks)

**Expected output:**
- CustomerID match rate: ~95%+
- RepID match rate: ~74% (known issue - some rep names don't match)
- Customer segments: Platinum/Gold/Silver/Bronze based on LTV

---

### 2. `02-alias-signals.sql`
**Purpose:** Create table for learning entity aliases

**What it does:**
- Creates `AliasSignals` table
- This captures when users select multiple filter values together, signaling they may be the same entity (e.g., "John Smith" and "J. Smith")

**Idempotent:** Yes

---

### 3. `03-create-shopify-sync-run-table.sql`
**Purpose:** Track Shopify bulk sync operations

**What it does:**
- Creates `ShopifySyncRun` table with columns for sync type, status, operation ID, timestamps, item count, and errors

**Idempotent:** No - will fail if table exists. Wrap in IF NOT EXISTS if needed.

---

### 4. `04-grant-write-permissions.sql`
**Purpose:** Enable the Next.js app to write to the database

**What it does:**
- Grants INSERT, UPDATE, DELETE on 15 tables to `limeappleNext` user

**When to run:** After initial deployment is verified working with read-only access

**Tables affected:**
- Sku, Customers, CustomerOrders, CustomerOrdersComments
- MissingShopifySkus, RawSkusFromShopify, ShopifySyncRun, CustomersFromShopify
- SkuCategories, SkuMainCategory, SkuMainSubRship
- Reps, Users, PPSizes, InventorySettings

---

## How to Run

### Option A: From EC2 Linux Server (Recommended)

1. Install SQL Server tools:
```bash
curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list | sudo tee /etc/apt/sources.list.d/msprod.list
sudo apt-get update
sudo apt-get install mssql-tools18 unixodbc-dev -y
```

2. Run each script:
```bash
/opt/mssql-tools18/bin/sqlcmd -S 3.141.136.218 -U limeappleNext -P '{PASSWORD}' -d Limeapple_Live_Nov2024 -i 01-schema-changes.sql -C
```

### Option B: From SQL Server Management Studio (SSMS)

1. Connect to `3.141.136.218` with `limeappleNext` credentials
2. Open each script and execute in order

### Option C: Via Node.js Script

Create a script using the `mssql` package (already in project dependencies):

```javascript
const sql = require('mssql');
const fs = require('fs');

const config = {
  server: '3.141.136.218',
  database: 'Limeapple_Live_Nov2024',
  user: 'limeappleNext',
  password: 'YOUR_PASSWORD',
  options: { encrypt: true, trustServerCertificate: true }
};

async function runMigration(filename) {
  const pool = await sql.connect(config);
  const script = fs.readFileSync(filename, 'utf8');
  await pool.request().query(script);
  console.log(`Completed: ${filename}`);
  await pool.close();
}
```

---

## Verification

After running all scripts, verify with:

```sql
-- Check new columns exist
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'CustomerOrders' AND COLUMN_NAME IN ('CustomerID', 'RepID');

-- Check CustomerID backfill rate
SELECT 
    COUNT(*) AS Total,
    SUM(CASE WHEN CustomerID IS NOT NULL THEN 1 ELSE 0 END) AS Matched
FROM CustomerOrders;

-- Check new tables exist
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('AliasSignals', 'ShopifySyncRun', 'RepTargets');

-- Check Customer analytics populated
SELECT TOP 5 StoreName, LTV, Segment, FirstOrderDate, LastOrderDate 
FROM Customers WHERE LTV > 0 ORDER BY LTV DESC;
```

---

## Known Issues

1. **RepID match rate ~74%** - Many order `SalesRep` values don't match `Reps.Name` exactly. Examples:
   - "Liz Farkas" (not in Reps table - needs to be added)
   - "Deborah Phillips - DelRio Agency" (should map to "de Pfyffer")
   
   These require data cleanup after deployment - see OPEN-QUESTIONS.md in project docs.

2. **CustomerID near 100%** - StoreName matching works well.

---

## Rollback

If needed, these changes can be reversed:

```sql
-- Remove columns (WARNING: loses backfilled data)
ALTER TABLE CustomerOrders DROP COLUMN CustomerID;
ALTER TABLE CustomerOrders DROP COLUMN RepID;

-- Drop new tables
DROP TABLE IF EXISTS AliasSignals;
DROP TABLE IF EXISTS ShopifySyncRun;
DROP TABLE IF EXISTS RepTargets;

-- Remove analytics columns from Customers
ALTER TABLE Customers DROP COLUMN FirstOrderDate;
ALTER TABLE Customers DROP COLUMN LastOrderDate;
ALTER TABLE Customers DROP COLUMN LTV;
ALTER TABLE Customers DROP COLUMN Segment;
ALTER TABLE Customers DROP COLUMN UsualOrderCycle;
ALTER TABLE Customers DROP COLUMN OrderCount;
ALTER TABLE Customers DROP COLUMN EstimatedPotential;
```

---

## Contact

Questions? See deployment documentation or contact Dan (daniel@plantdynamics.co).
