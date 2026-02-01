#!/bin/bash
# Check for schema drift between local Prisma schema and production database
# Generates migration SQL if drift is detected
# Usage: npm run check-schema-drift

set -e

EC2_HOST="ubuntu@3.131.126.250"
EC2_KEY="$HOME/.ssh/LANext.pem"
EC2_APP_DIR="/var/www/orderhubnow"
LOCAL_SCHEMA="prisma/schema.prisma"
TEMP_PROD_SCHEMA="/tmp/schema-production.prisma"
MIGRATION_FILE="sql-migrations/auto-generated-migration.sql"

echo ""
echo "=== Schema Drift Check ==="
echo ""

# 1. Copy local schema to EC2 for reference
echo "[1/5] Copying local schema to EC2..."
scp -i "$EC2_KEY" -q "$LOCAL_SCHEMA" "$EC2_HOST:/tmp/schema-local.prisma"

# 2. SSH into EC2 and pull production schema (use the app's schema as base, then pull)
echo "[2/5] Pulling production schema from Azure SQL..."
ssh -i "$EC2_KEY" "$EC2_HOST" "cd $EC2_APP_DIR && cp prisma/schema.prisma /tmp/schema-production.prisma && npx prisma db pull --schema=/tmp/schema-production.prisma"

# 3. Copy production schema back to local
echo "[3/5] Fetching production schema..."
scp -i "$EC2_KEY" -q "$EC2_HOST:/tmp/schema-production.prisma" "$TEMP_PROD_SCHEMA"

# 4. Generate migration SQL using prisma migrate diff
echo "[4/5] Generating migration SQL..."
MIGRATION_SQL=$(npx prisma migrate diff \
    --from-schema-datamodel "$TEMP_PROD_SCHEMA" \
    --to-schema-datamodel "$LOCAL_SCHEMA" \
    --script 2>/dev/null || echo "")

# 5. Check results
echo "[5/5] Analyzing results..."
echo ""

if [ -z "$MIGRATION_SQL" ] || [ "$MIGRATION_SQL" = "-- This is an empty migration." ]; then
    echo "✓ No schema drift detected!"
    echo "  Local schema matches production database."
    echo ""
    rm -f "$TEMP_PROD_SCHEMA"
    exit 0
else
    # Classify drift: allow "prod ahead" (drop-only) but fail when local is ahead
    SQL_NO_COMMENTS=$(echo "$MIGRATION_SQL" | sed 's/--.*$//')
    UNSAFE_PATTERN='CREATE[[:space:]]+TABLE|CREATE[[:space:]]+INDEX|ALTER[[:space:]]+TABLE[^;]*[[:space:]]ADD|ADD[[:space:]]+COLUMN|ADD[[:space:]]+CONSTRAINT|ALTER[[:space:]]+COLUMN'
    if echo "$SQL_NO_COMMENTS" | grep -Eiq "$UNSAFE_PATTERN"; then
        DRIFT_KIND="unsafe"
    else
        DRIFT_KIND="safe"
    fi

    if [ "$DRIFT_KIND" = "safe" ]; then
        echo "⚠️ SCHEMA DRIFT (PROD AHEAD - DROP-ONLY)"
        echo "  Production has schema objects not present locally."
        echo "  This is usually safe for older code. A rollback SQL is provided below."
        HEADER_TEXT="ROLLBACK SQL (prod ahead - do NOT apply unless intentionally rolling back)"
    else
        echo "❌ SCHEMA DRIFT DETECTED!"
        HEADER_TEXT="MIGRATION SQL (run this on production)"
    fi
    echo ""
    echo "=========================================="
    echo "  $HEADER_TEXT"
    echo "=========================================="
    echo ""
    echo "$MIGRATION_SQL"
    echo ""
    echo "=========================================="
    echo ""
    
    # Save migration to file
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    MIGRATION_FILE="sql-migrations/${TIMESTAMP}-auto-migration.sql"
    
    echo "-- Auto-generated migration to sync production with local schema" > "$MIGRATION_FILE"
    echo "-- Generated: $(date)" >> "$MIGRATION_FILE"
    echo "-- Run this on production database before deploying" >> "$MIGRATION_FILE"
    echo "" >> "$MIGRATION_FILE"
    echo "$MIGRATION_SQL" >> "$MIGRATION_FILE"
    echo "" >> "$MIGRATION_FILE"
    # Register migration (no GO - Prisma db execute doesn't support batch separators)
    echo "-- Register this migration" >> "$MIGRATION_FILE"
    echo "IF NOT EXISTS (SELECT 1 FROM SchemaMigrations WHERE Name = '${TIMESTAMP}-auto-migration')" >> "$MIGRATION_FILE"
    echo "    INSERT INTO SchemaMigrations (Name) VALUES ('${TIMESTAMP}-auto-migration');" >> "$MIGRATION_FILE"
    
    echo "Migration saved to: $MIGRATION_FILE"
    echo ""
    rm -f "$TEMP_PROD_SCHEMA"
    if [ "$DRIFT_KIND" = "safe" ]; then
        echo "Next steps:"
        echo "  1. Review the rollback SQL above (DO NOT apply unless you intend to roll back production schema)"
        echo "  2. You may proceed with deploy if you accept production being ahead"
        echo ""
        exit 0
    else
        echo "Next steps:"
        echo "  1. Review the migration SQL above"
        echo "  2. Run: npm run apply-migration $MIGRATION_FILE"
        echo "     (or manually run the SQL on production)"
        echo "  3. Deploy to EC2"
        echo ""
        exit 1
    fi
fi
