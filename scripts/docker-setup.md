# Local Docker Setup for Shopify Sync Testing

## Step 1: Start SQL Server Container

```bash
cd /Users/danielplant/orderhubnow/repo
docker-compose up -d
```

Wait ~30 seconds for SQL Server to initialize.

## Step 2: Create Database

```bash
docker exec -it orderhubnow-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "MyOrderHub@2026" -C \
  -Q "CREATE DATABASE Limeapple"
```

## Step 3: Switch to Local Database

In `.env`, comment out AWS and uncomment local:

```env
# AWS Live Database
#DATABASE_URL="sqlserver://3.141.136.218:1433;database=Limeapple_Live_Nov2024;..."

# Local Docker
DATABASE_URL="sqlserver://localhost:1433;database=Limeapple;user=sa;password=MyOrderHub@2026;encrypt=true;trustServerCertificate=true"
```

## Step 4: Push Prisma Schema

```bash
npx prisma db push
```

This creates all tables from `prisma/schema.prisma`.

## Step 5: Seed SkuCategories

Run the seed script (exports from production via EC2, imports locally):

```bash
node scripts/seed-categories.js
```

## Step 6: Run Shopify Sync

```bash
npm run dev
# Then in browser: POST to http://localhost:3000/api/shopify/sync
# Or use the admin UI at http://localhost:3000/admin/shopify
```

## Step 7: Verify

Check the data:
```bash
docker exec -it orderhubnow-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "MyOrderHub@2026" -C -d Limeapple \
  -Q "SELECT COUNT(*) as SkuCount FROM Sku; SELECT COUNT(*) as RawCount FROM RawSkusFromShopify"
```

## Cleanup

```bash
docker-compose down        # Stop container (keeps data)
docker-compose down -v     # Stop and delete data volume
```
