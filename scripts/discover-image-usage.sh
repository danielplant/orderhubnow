#!/bin/bash
# Discover all image display points in the codebase
# Documents: source, fallbacks, sizes

echo "=============================================="
echo "  IMAGE USAGE DISCOVERY REPORT"
echo "=============================================="
echo ""

echo "=== 1. Components with <img> or <Image> tags ==="
grep -rn "<img\|<Image" src/components/ --include="*.tsx" | grep -v node_modules
echo ""

echo "=== 2. Pages with <img> or <Image> tags ==="
grep -rn "<img\|<Image" src/app/ --include="*.tsx" | grep -v node_modules | head -30
echo ""

echo "=== 3. Image src= attributes (what's the source?) ==="
grep -rn "src={" src/components/ --include="*.tsx" | grep -v node_modules
echo ""

echo "=== 4. Background images in styles ==="
grep -rn "backgroundImage\|background-image" src/ --include="*.tsx" --include="*.css" | grep -v node_modules
echo ""

echo "=== 5. onError handlers (fallback logic) ==="
grep -rn "onError" src/components/ --include="*.tsx" | grep -v node_modules
echo ""

echo "=== 6. Fallback chains using || or ?? ==="
grep -rn "imageUrl.*||\|imageUrl.*??\|src.*||\|src.*??" src/components/ --include="*.tsx" | grep -v node_modules
echo ""

echo "=== 7. Calls to getSkuImageUrl (with size parameter) ==="
grep -rn "getSkuImageUrl" src/ --include="*.tsx" --include="*.ts" | grep -v "export function\|export const" | grep -v node_modules
echo ""

echo "=== 8. Calls to getThumbnailUrl (with size parameter) ==="
grep -rn "getThumbnailUrl" src/ --include="*.tsx" --include="*.ts" | grep -v "export function\|export const" | grep -v node_modules
echo ""

echo "=== 9. Shopify CDN references ==="
grep -rn "cdn.shopify.com\|shopifyImageUrl\|ShopifyImageURL" src/components/ --include="*.tsx" | grep -v node_modules
echo ""

echo "=== 10. Placeholder/fallback image references ==="
grep -rn "placeholder\|fallback\|default.*image\|FALLBACK" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -vi "typescript\|eslint"
echo ""

echo "=== 11. S3 URL construction ==="
grep -rn "s3.*amazonaws\|S3_BASE_URL\|orderhub-uploads" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
echo ""

echo "=== 12. Image size parameters (width/height in image context) ==="
grep -rn "width.*=.*[0-9]\|height.*=.*[0-9]" src/components/ --include="*.tsx" | grep -i "image\|img\|src" | grep -v node_modules | head -20
echo ""

echo "=============================================="
echo "  END OF REPORT"
echo "=============================================="
