#!/bin/bash
# Full deployment script: commit, push, check schema, apply migrations, deploy to EC2
# Usage: npm run deploy

set -e

EC2_HOST="ubuntu@3.131.126.250"
EC2_KEY="$HOME/.ssh/LANext.pem"
EC2_APP_DIR="/var/www/orderhubnow"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DEPLOYMENT SCRIPT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Check for uncommitted changes
echo "[1/8] Checking git status..."
if [[ -n $(git status --porcelain) ]]; then
    echo ""
    echo "Uncommitted changes detected:"
    git status --short
    echo ""
    read -p "Commit all changes? (yes/no): " COMMIT_CONFIRM
    if [ "$COMMIT_CONFIRM" = "yes" ]; then
        read -p "Enter commit message: " COMMIT_MSG
        git add -A
        git commit -m "$COMMIT_MSG"
        echo "✓ Changes committed"
    else
        echo "Aborted. Commit your changes first."
        exit 1
    fi
else
    echo "✓ Working directory clean"
fi

# Step 2: Type check
echo ""
echo "[2/8] Running type check..."
npm run type-check
echo "✓ Type check passed"

# Step 3: Lint
echo ""
echo "[3/8] Running lint..."
npm run lint
echo "✓ Lint passed"

# Step 4: Hydration safety check
echo ""
echo "[4/8] Checking for hydration risks..."
npm run check:hydration
echo "✓ Hydration check passed"

# Step 5: Build
echo ""
echo "[5/8] Running build..."
npm run build
echo "✓ Build passed"

# Step 6: Schema drift check
echo ""
echo "[6/8] Checking schema drift against production..."
DRIFT_OUTPUT=$(bash scripts/check-schema-drift.sh 2>&1) || true

if echo "$DRIFT_OUTPUT" | grep -q "SCHEMA DRIFT DETECTED"; then
    echo ""
    echo "$DRIFT_OUTPUT"
    echo ""
    
    # Find the latest migration file
    MIGRATION_FILE=$(ls -t sql-migrations/*-auto-migration.sql 2>/dev/null | head -1)
    
    if [ -n "$MIGRATION_FILE" ]; then
        echo ""
        read -p "Apply migration to production? (yes/no): " APPLY_CONFIRM
        if [ "$APPLY_CONFIRM" = "yes" ]; then
            echo ""
            echo "Applying migration..."
            bash scripts/apply-migration.sh "$MIGRATION_FILE"
            echo "✓ Migration applied"
            
            # Re-run drift check to confirm
            echo ""
            echo "Verifying schema alignment..."
            if bash scripts/check-schema-drift.sh 2>&1 | grep -q "No schema drift"; then
                echo "✓ Schema aligned with production"
            else
                echo "⚠️  Schema still has drift. Please investigate."
                exit 1
            fi
        else
            echo "Aborted. Apply migrations before deploying."
            exit 1
        fi
    fi
else
    echo "✓ No schema drift - production is aligned"
fi

# Step 7: Push to GitHub
echo ""
echo "[7/8] Pushing to GitHub..."
git push origin main
echo "✓ Pushed to GitHub"

# Step 8: Deploy to EC2 (rsync pre-built artifacts, no rebuild)
echo ""
echo "[8/8] Deploying to EC2..."

# Kill any stuck build processes from previous deploys
echo "  Cleaning up any stuck processes..."
ssh -i "$EC2_KEY" "$EC2_HOST" "pkill -f 'tsc|next build' 2>/dev/null || true"

# Sync source code
echo "  Syncing source code..."
ssh -i "$EC2_KEY" "$EC2_HOST" "cd $EC2_APP_DIR && git fetch origin main && git reset --hard origin/main"

# Rsync the pre-built .next folder (much faster than rebuilding on EC2)
echo "  Uploading pre-built assets..."
rsync -avz --delete -e "ssh -i $EC2_KEY" \
    .next/ "$EC2_HOST:$EC2_APP_DIR/.next/"

# Install production dependencies only and restart
echo "  Installing dependencies and restarting..."
ssh -i "$EC2_KEY" "$EC2_HOST" "cd $EC2_APP_DIR && \
    npm ci --omit=dev && \
    npx prisma generate && \
    pm2 restart orderhubnow"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ DEPLOYMENT COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Site: https://www.orderhubnow.com"
echo ""
