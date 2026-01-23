#!/bin/bash
# scripts/verify-sku-parsing.sh
# Run this to verify all fragile SKU parsing has been eliminated

set -e

echo "=== Checking for eliminated SKU parsing patterns ==="
echo ""

ERRORS=0

# 1. parseSkuId should not exist anywhere
echo "Checking for parseSkuId..."
if grep -r "parseSkuId" --include="*.ts" --include="*.tsx" src/ 2>/dev/null; then
  echo "❌ FAIL: parseSkuId still in use"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ PASS: parseSkuId eliminated"
fi

echo ""

# 2. extractBaseSku should not exist (we're centralizing to getBaseSku)
echo "Checking for extractBaseSku..."
if grep -r "extractBaseSku" --include="*.ts" --include="*.tsx" src/ 2>/dev/null; then
  echo "❌ FAIL: extractBaseSku still in use"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ PASS: extractBaseSku eliminated"
fi

echo ""

# 3. parseSizeFromSku should not be called (now using normalizeSizeToBucket)
echo "Checking for parseSizeFromSku..."
if grep -r "parseSizeFromSku" --include="*.ts" --include="*.tsx" src/ 2>/dev/null; then
  echo "❌ FAIL: parseSizeFromSku still in use"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ PASS: parseSizeFromSku eliminated"
fi

echo ""

# 4. Verify getBaseSku exists and is the central function
echo "Checking that getBaseSku is defined..."
if grep -r "export function getBaseSku" --include="*.ts" src/lib/ 2>/dev/null; then
  echo "✅ PASS: getBaseSku is defined"
else
  echo "❌ FAIL: getBaseSku not found"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# 5. Verify normalizeSizeToBucket exists
echo "Checking that normalizeSizeToBucket is defined..."
if grep -r "export function normalizeSizeToBucket" --include="*.ts" src/lib/ 2>/dev/null; then
  echo "✅ PASS: normalizeSizeToBucket is defined"
else
  echo "❌ FAIL: normalizeSizeToBucket not found"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=== Summary ==="
if [ $ERRORS -eq 0 ]; then
  echo "✅ All checks passed"
  exit 0
else
  echo "❌ $ERRORS check(s) failed"
  exit 1
fi
