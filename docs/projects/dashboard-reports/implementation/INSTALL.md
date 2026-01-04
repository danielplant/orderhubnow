# Dashboard & Reports Installation Guide

> **Location:** `05_myorderhub-v2/docs/projects/dashboard-reports/implementation/`  
> **Status:** WIP - Still being validated  
> **Snapshot Date:** December 31, 2025  
> **Run all commands from this folder** unless otherwise specified.

---

> **IMPORTANT: Read Before Proceeding**
>
> This guide has **two parts**:
> - **Part 1: Schema Migration** - Run these steps (safe, required for full functionality)
> - **Part 2: Code Bootstrap** - **ONLY** for fresh installs; skip if code already exists in `src/`
>
> The Dashboard+Reports code is **already merged** into `src/`. You likely only need Part 1.

---

## Overview

This package contains a complete analytics platform for MyOrderHub:
- **9 Reports**: Category Totals, PO Sold, SKU Velocity, Exception Report, Cohort Retention, Account Potential, Rep Scorecard, Customer LTV, First-to-Second Conversion
- **Enhanced Dashboard**: Live KPIs, exception alerts, at-risk accounts
- **Interactive Report Viewer**: Column customization, filtering, saved views, exports

## Prerequisites

1. Ensure the database is accessible
2. Have `sqlcmd` or another SQL client available
3. Node.js environment with Prisma installed

---

# Part 1: Schema Migration (Primary)

These steps are **safe to run** and are required for full report functionality.

## Step 1.1: Run Core Schema Changes

The schema changes enable Reports 3-9 (the new analytics).

```bash
# From THIS folder, run:
sqlcmd -S <server> -d <database> -i ./01-schema-changes.sql
```

Or via your preferred SQL client:
1. Open `./01-schema-changes.sql` (in this folder)
2. Execute against the production/staging database

**What this does:**
- Adds `CustomerID` and `RepID` foreign keys to `CustomerOrders`
- Backfills FK values by matching on StoreName/SalesRep
- Adds analytics fields to `Customers` (LTV, Segment, FirstOrderDate, etc.)
- Creates `RepTargets` table

## Step 1.2: Run AliasSignals Schema (Optional)

If you want the filter pattern learning system:

```bash
# From THIS folder:
sqlcmd -S <server> -d <database> -i ./03-alias-signals.sql
```

## Step 1.3: Regenerate Prisma Client

After running SQL scripts, update Prisma to recognize the new columns:

```bash
# Go to app root (4 levels up from this folder):
cd ../../../..

# Pull schema changes and regenerate:
npx prisma db pull
npx prisma generate

# Return to this folder if needed:
cd docs/projects/dashboard-reports/implementation
```

## Step 1.4: Verification Checklist

Run these checks to confirm schema migration succeeded:

### Database Checks

```sql
-- 1. CustomerID match rate (target: >95%, current: ~75%)
SELECT 
    COUNT(*) AS Total,
    SUM(CASE WHEN CustomerID IS NOT NULL THEN 1 ELSE 0 END) AS Matched,
    CAST(100.0 * SUM(CASE WHEN CustomerID IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,2)) AS MatchPercent
FROM CustomerOrders;

-- 2. RepID match rate
SELECT 
    COUNT(*) AS Total,
    SUM(CASE WHEN RepID IS NOT NULL THEN 1 ELSE 0 END) AS Matched,
    CAST(100.0 * SUM(CASE WHEN RepID IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS DECIMAL(5,2)) AS MatchPercent
FROM CustomerOrders
WHERE SalesRep IS NOT NULL AND SalesRep <> '';

-- 3. AliasSignals table exists (if Step 1.2 was run)
SELECT COUNT(*) AS RecordCount FROM AliasSignals;

-- 4. Customer segments populated
SELECT Segment, COUNT(*) AS CustomerCount 
FROM Customers 
WHERE Segment IS NOT NULL 
GROUP BY Segment;
```

### Checklist

| Check | Expected | Status |
|-------|----------|--------|
| `CustomerOrders.CustomerID` column exists | Yes | [ ] |
| `CustomerOrders.RepID` column exists | Yes | [ ] |
| CustomerID match rate | >75% (target: 95%) | [ ] |
| RepID match rate | >70% | [ ] |
| `Customers.LTV` column exists | Yes | [ ] |
| `Customers.Segment` populated | >0 records | [ ] |
| `RepTargets` table exists | Yes | [ ] |
| `AliasSignals` table exists (optional) | Yes if Step 1.2 run | [ ] |
| Prisma regenerated successfully | No errors | [ ] |

### Expected Behavior After Schema Migration

| Report | Behavior |
|--------|----------|
| Category Totals | Full functionality |
| PO Sold | Full functionality |
| SKU Velocity | Full functionality |
| Exception Report | Works, but accuracy limited by FK match rate |
| Cohort Retention | Works with matched customers only |
| Account Potential | Works, ~36% have EstimatedPotential |
| Rep Scorecard | Works, uses Country as Territory fallback |
| Customer LTV | Full functionality for segmented customers |
| First-to-Second | Works with matched customers only |

---

# Part 2: Code Bootstrap (Fresh Install ONLY)

> **STOP! Do you need this section?**
>
> - If Dashboard+Reports **already exists** in `src/` → **SKIP this section entirely**
> - If you're setting up a **fresh environment** → Continue below
> - If unsure, check: `ls ../../../../src/app/admin/reports/`
>   - If it exists → SKIP
>   - If "No such file" → Continue

## Step 2.1: Install Dependencies

```bash
cd ../../../..  # Go to app root
npm install exceljs
```

## Step 2.2: Run Install Script (Fresh Install Only)

```bash
# Return to this folder:
cd docs/projects/dashboard-reports/implementation

# Run with safety check:
./install.sh
```

The script will:
- Check if files already exist (and warn you)
- Copy snapshot files from `./code/` to `../../../../src/`
- Create backup of `navigation.ts` before overwriting

**If the script warns that files exist, do NOT proceed** unless you intentionally want to overwrite.

## Step 2.3: Manual Copy Alternative

If you prefer manual control, copy these files:

```
FROM (this folder)                      TO (app src/)
─────────────────────────────────────────────────────────
./code/types/report.ts               →  lib/types/report.ts
./code/lib/data/queries/reports.ts   →  lib/data/queries/reports.ts
./code/lib/constants/navigation.ts   →  lib/constants/navigation.ts
./code/app/admin/page.tsx            →  app/admin/page.tsx
./code/app/admin/reports/page.tsx    →  app/admin/reports/page.tsx
./code/app/api/reports/route.ts      →  app/api/reports/route.ts
./code/app/api/reports/export/route.ts → app/api/reports/export/route.ts
./code/components/admin/*            →  components/admin/
```

---

## Feature Overview

### Reports Available Immediately (No Schema Changes)
- Category Totals
- PO Sold  
- SKU Velocity

### Reports Available After Schema Changes
- Exception Report
- Cohort Retention
- Account Potential
- Rep Scorecard
- Customer LTV
- First-to-Second Conversion

---

## Troubleshooting

### "Exception alerts require schema updates"
Run `./01-schema-changes.sql` and regenerate Prisma (Part 1).

### Reports show 0 results
1. Check if data exists in the source tables
2. Verify FK backfill completed (check match rates)
3. Check browser console for API errors

### Export fails
1. Ensure `exceljs` is installed: `npm install exceljs`
2. Check API route is accessible

### FK match rate too low
This is a data quality issue - order data has variant spellings vs master tables.
The AliasSignals system will learn patterns from user selections over time.

---

## File Structure

```
implementation/                      ← YOU ARE HERE
├── README.md                        # Overview and warnings
├── INSTALL.md                       # This file
├── install.sh                       # Automated copy (use with caution)
├── 00-IMPLEMENTATION-TRACKER.md     # Progress tracking
├── 01-schema-changes.sql            # Primary schema migration
├── 02-schema-changes.prisma         # Prisma reference (not executed)
├── 03-alias-signals.sql             # Optional AliasSignals table
└── code/                            # Source snapshot (Dec 31, 2025)
    ├── app/
    ├── components/
    ├── lib/
    └── types/
```

---

## Support

If you encounter issues:
1. Check the browser console for errors
2. Check the server logs for API failures
3. Verify database connectivity
4. Confirm schema migration completed (run verification queries)
