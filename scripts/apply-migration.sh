#!/bin/bash
# Apply a SQL migration to production database via EC2
# Usage: npm run apply-migration <migration-file>

set -e

EC2_HOST="ubuntu@3.131.126.250"
EC2_KEY="$HOME/.ssh/LANext.pem"
EC2_APP_DIR="/var/www/orderhubnow"

MIGRATION_FILE="$1"

if [ -z "$MIGRATION_FILE" ]; then
    echo "Usage: npm run apply-migration <migration-file>"
    echo "Example: npm run apply-migration sql-migrations/20260115-auto-migration.sql"
    exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo ""
echo "=== Apply Migration ==="
echo ""
echo "Migration file: $MIGRATION_FILE"
echo ""

# Show the migration content
echo "Migration SQL:"
echo "============================================"
cat "$MIGRATION_FILE"
echo ""
echo "============================================"
echo ""

# Confirm before applying
read -p "Apply this migration to production? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "[1/3] Copying migration to EC2..."
scp -i "$EC2_KEY" -q "$MIGRATION_FILE" "$EC2_HOST:/tmp/migration-to-apply.sql"

echo "[2/3] Applying migration to production database..."
ssh -i "$EC2_KEY" "$EC2_HOST" "cd $EC2_APP_DIR && npx tsx scripts/run-migration.ts /tmp/migration-to-apply.sql"

echo "[3/3] Verifying..."
echo ""
echo "✓ Migration applied successfully!"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run check-schema-drift' to verify no more drift"
echo "  2. Deploy to EC2"
echo ""
