#!/bin/bash
# Find all places in the codebase where thumbnails are used

echo "=== 1. Files importing from thumbnails.ts ==="
grep -rn "from.*thumbnails" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

echo ""
echo "=== 2. Calls to getThumbnailUrl ==="
grep -rn "getThumbnailUrl" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

echo ""
echo "=== 3. Calls to getSkuImageUrl (may use thumbnails internally) ==="
grep -rn "getSkuImageUrl" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

echo ""
echo "=== 4. References to THUMBNAIL_SIZES constant ==="
grep -rn "THUMBNAIL_SIZES" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

echo ""
echo "=== 5. References to ThumbnailPath database field ==="
grep -rn "ThumbnailPath" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

echo ""
echo "=== 6. Direct S3 thumbnail path references ==="
grep -rn "thumbnails/" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

echo ""
echo "=== 7. Pixel values 120, 240, 480, 720 near thumbnail/image context ==="
grep -rn -E "(120|240|480|720).*(thumbnail|image|width|height|size)" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
grep -rn -E "(thumbnail|image|width|height|size).*(120|240|480|720)" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

echo ""
echo "=== 8. Excel/PDF export files (likely use small thumbnails) ==="
ls -la src/lib/export/ 2>/dev/null || echo "No export directory found"
grep -rn "thumbnail" src/lib/export/ --include="*.ts" 2>/dev/null
grep -rn "thumbnail" src/app/api/*/export/ --include="*.ts" 2>/dev/null
grep -rn "thumbnail" src/app/api/*/*/export/ --include="*.ts" 2>/dev/null

echo ""
echo "=== 9. Image components that might display thumbnails ==="
grep -rn "ShopifyImageURL\|thumbnailUrl\|imageUrl" src/components/ --include="*.tsx" 2>/dev/null | head -20

echo ""
echo "=== DONE ==="
