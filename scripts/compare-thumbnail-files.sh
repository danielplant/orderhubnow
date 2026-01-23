#!/bin/bash
# Compare the two thumbnail utility files to understand duplication

echo "=== File 1: src/lib/utils/thumbnails.ts ==="
echo "Lines: $(wc -l < src/lib/utils/thumbnails.ts)"
echo ""
echo "--- Exports ---"
grep -n "^export " src/lib/utils/thumbnails.ts | head -30
echo ""

echo "=== File 2: src/lib/utils/thumbnail-url.ts ==="
echo "Lines: $(wc -l < src/lib/utils/thumbnail-url.ts)"
echo ""
echo "--- Exports ---"
grep -n "^export " src/lib/utils/thumbnail-url.ts | head -30
echo ""

echo "=== Who imports thumbnails.ts? ==="
grep -rn "from.*['\"]@/lib/utils/thumbnails['\"]" src/ --include="*.ts" --include="*.tsx" | grep -v thumbnails.ts | grep -v __tests__
echo ""

echo "=== Who imports thumbnail-url.ts? ==="
grep -rn "from.*['\"]@/lib/utils/thumbnail-url['\"]" src/ --include="*.ts" --include="*.tsx" | grep -v thumbnail-url.ts
echo ""

echo "=== THUMBNAIL_SIZES in thumbnails.ts ==="
grep -A5 "THUMBNAIL_SIZES = {" src/lib/utils/thumbnails.ts
echo ""

echo "=== THUMBNAIL_SIZES in thumbnail-url.ts ==="
grep -A5 "THUMBNAIL_SIZES = {" src/lib/utils/thumbnail-url.ts
echo ""

echo "=== DONE ==="
