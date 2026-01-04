#!/bin/bash
# ============================================================================
# Dashboard & Reports Installation Script
# ============================================================================
# WARNING: This script OVERWRITES files in src/. Only use for:
#   - Fresh environment setup (no existing Dashboard+Reports code)
#   - Intentional restore to Dec 31, 2025 snapshot
#
# If Dashboard+Reports is already in src/, DO NOT RUN THIS SCRIPT.
# Use git for updates instead.
#
# Usage: 
#   ./install.sh           # Interactive mode with safety checks
#   ./install.sh --force   # Skip safety checks (dangerous)
#   ./install.sh --dry-run # Show what would be copied without copying
# ============================================================================

set -e

# Parse arguments
FORCE_MODE=false
DRY_RUN=false
for arg in "$@"; do
    case $arg in
        --force)
            FORCE_MODE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_DIR="$SCRIPT_DIR/code"
# Location: 05_myorderhub-v2/docs/projects/dashboard-reports/implementation/
# Target is 4 levels up to 05_myorderhub-v2, then into src
TARGET_DIR="$(cd "$SCRIPT_DIR/../../../../src" && pwd)"

echo "============================================"
echo "Dashboard & Reports Installation"
echo "============================================"
echo ""
echo "Source: $CODE_DIR"
echo "Target: $TARGET_DIR"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN MODE - No files will be copied]"
    echo ""
fi

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Target directory not found: $TARGET_DIR"
    exit 1
fi

# ============================================================================
# SAFETY CHECK: Detect if Dashboard+Reports is already installed
# ============================================================================
EXISTING_FILES=()

if [ -f "$TARGET_DIR/app/admin/reports/page.tsx" ]; then
    EXISTING_FILES+=("app/admin/reports/page.tsx")
fi
if [ -f "$TARGET_DIR/components/admin/reports-page-client.tsx" ]; then
    EXISTING_FILES+=("components/admin/reports-page-client.tsx")
fi
if [ -f "$TARGET_DIR/app/api/reports/route.ts" ]; then
    EXISTING_FILES+=("app/api/reports/route.ts")
fi

if [ ${#EXISTING_FILES[@]} -gt 0 ]; then
    echo "============================================"
    echo "⚠️  WARNING: EXISTING INSTALLATION DETECTED"
    echo "============================================"
    echo ""
    echo "The following Dashboard+Reports files already exist in src/:"
    for file in "${EXISTING_FILES[@]}"; do
        echo "  - $file"
    done
    echo ""
    echo "Running this script will OVERWRITE these files with the"
    echo "Dec 31, 2025 snapshot, potentially losing newer changes."
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        echo "[Dry-run mode - showing what would happen if you proceed]"
        echo ""
    elif [ "$FORCE_MODE" = true ]; then
        echo "[--force flag detected, proceeding anyway...]"
        echo ""
    else
        echo "Options:"
        echo "  1. Press Ctrl+C to abort (recommended)"
        echo "  2. Type 'OVERWRITE' to proceed anyway"
        echo "  3. Run with --dry-run to see what would be copied"
        echo ""
        read -p "Your choice: " CONFIRM
        if [ "$CONFIRM" != "OVERWRITE" ]; then
            echo ""
            echo "Aborted. No files were changed."
            exit 0
        fi
        echo ""
    fi
fi

# ============================================================================
# INSTALLATION
# ============================================================================

if [ "$DRY_RUN" = true ]; then
    echo "Would create directories:"
    echo "  - $TARGET_DIR/app/admin/reports"
    echo "  - $TARGET_DIR/app/api/reports/export"
    echo "  - $TARGET_DIR/lib/types"
    echo "  - $TARGET_DIR/lib/data/queries"
    echo ""
    echo "Would copy files:"
    echo "  - types/report.ts → lib/types/report.ts"
    echo "  - lib/data/queries/reports.ts → lib/data/queries/reports.ts"
    echo "  - lib/constants/navigation.ts → lib/constants/navigation.ts"
    echo "  - app/admin/page.tsx → app/admin/page.tsx"
    echo "  - app/admin/reports/page.tsx → app/admin/reports/page.tsx"
    echo "  - app/api/reports/route-complete.ts → app/api/reports/route.ts"
    echo "  - app/api/reports/export/route.ts → app/api/reports/export/route.ts"
    echo "  - 10 component files → components/admin/"
    echo ""
    echo "[DRY RUN COMPLETE - No files were copied]"
    exit 0
fi

# Create directories if needed
echo "Creating directories..."
mkdir -p "$TARGET_DIR/app/admin/reports"
mkdir -p "$TARGET_DIR/app/api/reports/export"
mkdir -p "$TARGET_DIR/lib/types"
mkdir -p "$TARGET_DIR/lib/data/queries"

# Copy types
echo "Copying types..."
cp "$CODE_DIR/types/report.ts" "$TARGET_DIR/lib/types/report.ts"

# Copy queries
echo "Copying queries..."
cp "$CODE_DIR/lib/data/queries/reports.ts" "$TARGET_DIR/lib/data/queries/reports.ts"

# Copy navigation (backup existing first)
echo "Updating navigation..."
if [ -f "$TARGET_DIR/lib/constants/navigation.ts" ]; then
    cp "$TARGET_DIR/lib/constants/navigation.ts" "$TARGET_DIR/lib/constants/navigation.ts.bak"
    echo "  (backed up existing navigation.ts to navigation.ts.bak)"
fi
cp "$CODE_DIR/lib/constants/navigation.ts" "$TARGET_DIR/lib/constants/navigation.ts"

# Copy pages
echo "Copying pages..."
cp "$CODE_DIR/app/admin/page.tsx" "$TARGET_DIR/app/admin/page.tsx"
cp "$CODE_DIR/app/admin/reports/page.tsx" "$TARGET_DIR/app/admin/reports/page.tsx"

# Copy API routes (use the complete version)
echo "Copying API routes..."
cp "$CODE_DIR/app/api/reports/route-complete.ts" "$TARGET_DIR/app/api/reports/route.ts"
cp "$CODE_DIR/app/api/reports/export/route.ts" "$TARGET_DIR/app/api/reports/export/route.ts"

# Copy components
echo "Copying components..."
COMPONENTS=(
    "report-type-selector.tsx"
    "report-toolbar.tsx"
    "report-data-table.tsx"
    "reports-page-client.tsx"
    "columns-popover.tsx"
    "filters-popover.tsx"
    "saved-views-popover.tsx"
    "report-export-buttons.tsx"
    "exception-alerts-widget.tsx"
    "at-risk-accounts-widget.tsx"
)

for component in "${COMPONENTS[@]}"; do
    cp "$CODE_DIR/components/admin/$component" "$TARGET_DIR/components/admin/$component"
done

echo ""
echo "============================================"
echo "Installation Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Run schema changes (if not done): sqlcmd -S <server> -d <db> -i ./01-schema-changes.sql"
echo "2. Update Prisma: cd ../../../.. && npx prisma db pull && npx prisma generate"
echo "3. Install dependencies: npm install exceljs"
echo "4. Start dev server: npm run dev"
echo "5. Navigate to /admin to verify"
echo ""
