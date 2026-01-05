# SQL Migrations for OrderHubNow

## Quick Start (FOR BILAL)

**Run this ONE file in SQL Server Management Studio:**

```
MASTER-MIGRATION.sql
```

That's it. This single file contains everything needed. It's idempotent (safe to re-run).

---

## Details

**Database:** Limeapple_Live_Nov2024  
**Server:** 3.141.136.218:1433  
**User to grant permissions to:** limeappleNext

### What MASTER-MIGRATION.sql Does

1. **Grants write permissions** to limeappleNext user (INSERT/UPDATE/DELETE)
2. **Creates ShopifySyncRun table** for Shopify sync tracking
3. **Creates AliasSignals table** for learning entity aliases
4. **Creates AuthTokens table** for secure password reset/invite flow
5. **Adds auth columns to Users** (PasswordHash, Status, MustResetPassword)
6. **Creates OrderNumberSequence table** for thread-safe order numbers
7. **Creates uspGetNextOrderNumber stored procedure** for atomic order number generation
8. **Adds analytics columns** to Customers (LTV, Segment, FirstOrderDate, etc.)
9. **Backfills FK columns** (CustomerID, RepID) on CustomerOrders
10. **Creates performance indexes**

### Expected Runtime
~2-5 minutes

### Validation
The script prints validation results at the end showing:
- Tables created
- Stored procedures created
- Order sequence values
- CustomerID match rate
- Customer segment distribution

---

## Individual Scripts (Reference Only)

The individual scripts below are kept for reference. Use MASTER-MIGRATION.sql instead.

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

### 5. `05-auth-system.sql`
**Purpose:** Password security upgrade with invite flow and hashing

**What it does:**
- Adds columns to `Users`: `PasswordHash`, `Status`, `MustResetPassword`, `Email`
- Creates `AuthTokens` table for invite and password reset tokens
- Backfills `Email` from `LoginID` or `Reps.Email1`
- Sets all existing users to `Status = 'legacy'` (forces password reset)

**When to run:** Before deploying new auth system

**Idempotent:** Yes - uses IF NOT EXISTS checks

**Related code:**
- `src/lib/auth/password.ts` - bcrypt hashing utilities
- `src/lib/auth/config.ts` - NextAuth with status-based blocking
- `src/lib/auth/tokens.ts` - Token generation and validation

---

### 6. `06-order-number-sequence.sql` 
**Purpose:** Fix order number race condition with atomic generation

**CRITICAL:** Must run BEFORE Next.js goes live with order creation

**What it does:**
- Creates `OrderNumberSequence` table with counters for A and P prefixes
- Initializes counters from current MAX values in `CustomerOrders`
- Creates `uspGetNextOrderNumber` stored procedure (atomic increment)
- Adds UNIQUE constraint on `CustomerOrders.OrderNumber`

**Why needed:**
The legacy .NET code has a race condition where two concurrent orders can get the same order number. The stored procedure uses atomic `UPDATE...SET @var = col = col + 1` which is safe under concurrency.

**Idempotent:** Yes - uses IF NOT EXISTS checks

**Verification after running:**
```sql
-- Check sequence counters initialized
SELECT Prefix, LastNumber FROM OrderNumberSequence;

-- Check unique constraint exists
SELECT name FROM sys.indexes 
WHERE object_id = OBJECT_ID('CustomerOrders') 
  AND name = 'UQ_CustomerOrders_OrderNumber';

-- Test the stored procedure
DECLARE @OrderNumber NVARCHAR(50);
EXEC uspGetNextOrderNumber @Prefix = 'A', @OrderNumber = @OrderNumber OUTPUT;
SELECT @OrderNumber AS TestOrderNumber;
```

**Related code:**
- `src/lib/data/actions/orders.ts` - `getNextOrderNumber()` calls the SP
- `prisma/schema.prisma` - `OrderNumberSequence` model added

**Note:** The Next.js code has a fallback to the legacy method if the SP doesn't exist yet, so deploy order is flexible. However, the SP MUST be deployed before any real orders are created to avoid duplicates.

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
