#!/bin/bash
# Docker Setup Script for OrderHubNow Local Development
# This sets up a local SQL Server with seed data for Shopify sync testing

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== OrderHubNow Docker Setup ==="
echo ""

# Step 1: Start SQL Server
echo "Step 1: Starting SQL Server container..."
cd "$REPO_DIR"
docker-compose up -d

echo "Waiting for SQL Server to be ready (30 seconds)..."
sleep 30

# Step 2: Create database
echo ""
echo "Step 2: Creating Limeapple database..."
docker exec -it orderhubnow-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "MyOrderHub@2026" -C \
  -Q "IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'Limeapple') CREATE DATABASE Limeapple"

# Step 3: Switch .env to local database
echo ""
echo "Step 3: Updating .env to use local database..."
cd "$REPO_DIR"

# Backup current .env
cp .env .env.backup

# Comment out AWS database and uncomment local
sed -i.bak 's/^DATABASE_URL="sqlserver:\/\/3.141/#DATABASE_URL="sqlserver:\/\/3.141/' .env
sed -i.bak 's/^#DATABASE_URL="sqlserver:\/\/localhost/DATABASE_URL="sqlserver:\/\/localhost/' .env

echo "DATABASE_URL switched to localhost"

# Step 4: Run Prisma to create schema
echo ""
echo "Step 4: Creating database schema with Prisma..."
npx prisma db push --skip-generate

# Step 5: Seed reference tables
echo ""
echo "Step 5: Seeding reference tables..."
docker exec -i orderhubnow-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "MyOrderHub@2026" -C -d Limeapple \
  < "$SCRIPT_DIR/seed-data/seed-all.sql"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Start the app: npm run dev"
echo "  2. Go to http://localhost:3000/admin/shopify"
echo "  3. Click 'Start Sync' to pull fresh data from Shopify"
echo ""
echo "To restore original .env: cp .env.backup .env"
