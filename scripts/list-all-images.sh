#!/bin/bash
# List EVERY image display - no grouping, no summarization

echo "=== EVERY IMAGE DISPLAY ==="
echo ""
echo "Format: FILE:LINE: CODE"
echo ""

echo "--- src={ in components ---"
grep -rn "src={" src/components/ --include="*.tsx" | grep -v node_modules
echo ""

echo "--- src={ in app pages ---"
grep -rn "src={" src/app/ --include="*.tsx" | grep -v node_modules
echo ""

echo "--- backgroundImage in components ---"
grep -rn "backgroundImage" src/components/ --include="*.tsx" | grep -v node_modules
echo ""

echo "--- backgroundImage in app pages ---"
grep -rn "backgroundImage" src/app/ --include="*.tsx" | grep -v node_modules
echo ""

echo "=== DONE ==="
