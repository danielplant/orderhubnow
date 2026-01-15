#!/bin/bash
# =============================================================================
# dev-reset.sh - Kill servers, sync database, and restart dev
# =============================================================================
# Usage: ./scripts/dev-reset.sh
# Or:    npm run dev:reset
# =============================================================================

set -e

# Load .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

echo ""
echo "=========================================="
echo "  DEV RESET - Full Environment Sync"
echo "=========================================="
echo ""

# -----------------------------------------------------------------------------
# Step 1: Kill all servers
# -----------------------------------------------------------------------------
echo "[1/6] Killing all Node.js servers..."
pkill -9 -f node 2>/dev/null || true
pkill -9 -f next 2>/dev/null || true
sleep 1
echo "      ✓ Servers killed"
echo ""

# -----------------------------------------------------------------------------
# Step 2: Check schema drift
# -----------------------------------------------------------------------------
echo "[2/6] Checking database schema drift..."
DRIFT=$(npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma 2>&1 || true)

if echo "$DRIFT" | grep -q "No difference"; then
    echo "      ✓ Database is in sync with schema"
    NEEDS_PUSH=false
else
    echo "      ⚠ Schema drift detected:"
    echo "$DRIFT" | grep -E "^\[|\[+\]|\[\*\]|Added|Changed|Altered" | head -30 | sed 's/^/        /'
    NEEDS_PUSH=true
fi
echo ""

# -----------------------------------------------------------------------------
# Step 3: Fix constraints and push schema (if needed)
# -----------------------------------------------------------------------------
if [ "$NEEDS_PUSH" = true ]; then
    echo "[3/6] Fixing database constraints and pushing schema..."

    # Run inline SQL to drop blocking constraints
    node -e "
const sql = require('mssql');

async function fixConstraints() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.log('      DATABASE_URL not set, skipping constraint fix');
        return;
    }

    // Parse connection string
    let server, port, database, user, password;
    const format1 = dbUrl.match(/sqlserver:\/\/([^:]+):([^@]+)@([^:]+):(\d+);database=([^;]+)/i);
    const format2 = dbUrl.match(/sqlserver:\/\/([^:;]+):(\d+);database=([^;]+);user=([^;]+);password=([^;]+)/i);

    if (format1) {
        [, user, password, server, port, database] = format1;
    } else if (format2) {
        [, server, port, database, user, password] = format2;
    } else {
        console.log('      Could not parse DATABASE_URL, skipping constraint fix');
        return;
    }

    const config = {
        server, port: parseInt(port, 10), database, user, password,
        options: { encrypt: true, trustServerCertificate: true },
    };

    let pool;
    try {
        pool = await sql.connect(config);

        // Drop default constraints on ShipmentDocuments that block alterations
        const constraintQuery = \`
            DECLARE @sql NVARCHAR(MAX) = '';
            SELECT @sql = @sql + 'ALTER TABLE [' + OBJECT_NAME(dc.parent_object_id) + '] DROP CONSTRAINT [' + dc.name + ']; '
            FROM sys.default_constraints dc
            JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
            WHERE OBJECT_NAME(dc.parent_object_id) = 'ShipmentDocuments'
              AND c.name IN ('GeneratedAt', 'MimeType', 'SentToCustomer', 'SentAt');
            IF @sql != '' EXEC sp_executesql @sql;
        \`;

        await pool.request().query(constraintQuery);
        console.log('      ✓ Dropped blocking constraints');
    } catch (err) {
        // Constraints may not exist - that's OK
        if (!err.message.includes('does not exist')) {
            console.log('      Note:', err.message);
        }
    } finally {
        if (pool) await pool.close();
    }
}

fixConstraints().catch(console.error);
"

    # Now push the schema
    echo "      Pushing schema to database..."
    PUSH_OUTPUT=$(npx prisma db push --accept-data-loss 2>&1) || true

    if echo "$PUSH_OUTPUT" | grep -q "Error"; then
        echo "      ✗ Schema push failed:"
        echo "$PUSH_OUTPUT" | grep -E "Error|error|constraint" | sed 's/^/        /'
        echo ""
        echo "      Try running manually: npx prisma db push"
        exit 1
    else
        echo "$PUSH_OUTPUT" | grep -E "✓|applied|Your database is now in sync" | sed 's/^/      /' || true
        echo "      ✓ Schema pushed"
    fi
else
    echo "[3/6] Skipping schema push (no drift detected)"
fi
echo ""

# -----------------------------------------------------------------------------
# Step 4: Regenerate Prisma client
# -----------------------------------------------------------------------------
echo "[4/6] Regenerating Prisma client..."
npx prisma generate 2>&1 | grep -E "✓|Generated" | sed 's/^/      /' || true
echo "      ✓ Prisma client regenerated"
echo ""

# -----------------------------------------------------------------------------
# Step 5: Check for hydration risks
# -----------------------------------------------------------------------------
echo "[5/6] Checking for hydration risks..."
HYDRATION_OUTPUT=$(npm run check:hydration 2>&1) || HYDRATION_EXIT=$?

if [ "${HYDRATION_EXIT:-0}" -ne 0 ]; then
    echo ""
    echo "$HYDRATION_OUTPUT"
    echo ""
    echo "      ⚠ Hydration issues detected!"
    echo "      Run 'npm run check:hydration:fix' to auto-fix where possible."
    echo ""
    read -p "      Continue anyway? (yes/no): " CONTINUE_CONFIRM
    if [ "$CONTINUE_CONFIRM" != "yes" ]; then
        echo "      Aborted."
        exit 1
    fi
else
    echo "      ✓ No hydration risks detected"
fi
echo ""

# -----------------------------------------------------------------------------
# Step 6: Start dev server
# -----------------------------------------------------------------------------
echo "[6/6] Starting dev server..."
echo ""
echo "=========================================="
echo "  ✓ Environment synced - starting dev"
echo "=========================================="
echo ""

npm run dev
