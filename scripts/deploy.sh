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

# Pre-flight: Check if dev server is running
# The dev server writes to .next and can corrupt production builds
if lsof -i :3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "❌ ERROR: Dev server detected on port 3000"
    echo ""
    echo "   The dev server modifies .next while running, which can"
    echo "   corrupt production builds and cause missing page errors."
    echo ""
    echo "   Please stop 'npm run dev' before deploying."
    echo ""
    exit 1
fi

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

# Guardrail: only allow deploys from main
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "❌ ERROR: You are on branch '$CURRENT_BRANCH'. Deploys are only allowed from 'main'."
    exit 1
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
# Stamp the build with the git commit so we can verify deploy alignment
BUILD_COMMIT=$(git rev-parse HEAD)
echo "$BUILD_COMMIT" > .next/BUILD_COMMIT
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
# Skip pre-push hook (--no-verify) since we already ran build + schema checks above
echo ""
echo "[7/8] Pushing to GitHub..."
git push origin main --no-verify
echo "✓ Pushed to GitHub"

# Step 7.5: Verify deploy commit and build alignment
echo ""
echo "[7.5/8] Verifying deploy commit matches origin/main and build..."
git fetch origin main >/dev/null 2>&1 || true
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)
if [[ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]]; then
    echo "❌ ERROR: Local HEAD ($LOCAL_COMMIT) does not match origin/main ($REMOTE_COMMIT)."
    echo "   Please pull/rebase and re-run deploy so build artifacts match origin/main."
    exit 1
fi
if [[ ! -f .next/BUILD_COMMIT ]]; then
    echo "❌ ERROR: Missing .next/BUILD_COMMIT. Re-run 'npm run build' to stamp the build."
    exit 1
fi
STAMPED_COMMIT=$(cat .next/BUILD_COMMIT)
if [[ "$STAMPED_COMMIT" != "$LOCAL_COMMIT" ]]; then
    echo "❌ ERROR: .next was built from $STAMPED_COMMIT but current HEAD is $LOCAL_COMMIT."
    echo "   Re-run 'npm run build' so .next matches the deploy commit."
    exit 1
fi
echo "✓ Deploy commit and build are aligned"

# Step 8: Deploy to EC2 (rsync pre-built artifacts, no rebuild)
echo ""
echo "[8/8] Deploying to EC2..."

# Kill any stuck build processes from previous deploys
# Note: We use a temp script approach because pkill -f 'pattern' would match
# and kill its own parent bash shell (the pattern appears in bash -c "...")
echo "  Cleaning up any stuck processes..."
ssh -i "$EC2_KEY" "$EC2_HOST" 'pids=$(pgrep -f "tsc|next build" 2>/dev/null | grep -v $$); [ -n "$pids" ] && kill $pids 2>/dev/null || true'

# Sync source code
echo "  Syncing source code..."
ssh -i "$EC2_KEY" "$EC2_HOST" "cd $EC2_APP_DIR && git fetch origin main && git reset --hard origin/main"

# Rsync the pre-built .next folder (much faster than rebuilding on EC2)
# Exclude dev-only content:
#   - /dev/       = Turbopack dev server cache (~1GB+ of incremental build artifacts)
#                   Note: must use /dev/ not dev/ to avoid excluding nested dev/ dirs
#                   like .next/server/app/admin/(protected)/(dev)/dev/
#   - /cache/     = Image optimization & fetch caches (regenerated on EC2 as needed)
#   - trace*      = Build telemetry files (not needed for runtime)
echo "  Uploading pre-built assets..."
rsync -avz --delete \
    --exclude='/dev/' \
    --exclude='/cache/' \
    --exclude='trace' \
    --exclude='trace-build' \
    -e "ssh -i $EC2_KEY" \
    .next/ "$EC2_HOST:$EC2_APP_DIR/.next/"

# Install production dependencies only and restart
# Note: --ignore-scripts skips the "prepare" hook which requires husky (a dev dependency)
echo "  Installing dependencies and restarting..."
ssh -i "$EC2_KEY" "$EC2_HOST" "cd $EC2_APP_DIR && \
    npm ci --omit=dev --ignore-scripts && \
    npx prisma generate && \
    pm2 restart orderhubnow"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ DEPLOYMENT COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Site: https://www.orderhubnow.com"
echo ""
