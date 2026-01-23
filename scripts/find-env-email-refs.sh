#!/bin/bash
# Scan codebase for all .env email variable references that should be replaced with DB lookups

echo "=== Scanning for ENV email variable references ==="
echo ""

# Define the env vars we want to eliminate
ENV_VARS=(
  "SMTP_HOST"
  "SMTP_PORT"
  "SMTP_USER"
  "SMTP_PASSWORD"
  "SMTP_SECURE"
  "EMAIL_FROM"
  "EMAIL_SALES"
  "EMAIL_CC"
)

# Search in src directory, excluding node_modules and .next
for var in "${ENV_VARS[@]}"; do
  echo "--- $var ---"
  grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
    -E "(process\.env\.$var|process\.env\[.$var|\"$var\"|'$var')" \
    src/ 2>/dev/null | grep -v node_modules | grep -v ".next"
  echo ""
done

echo "=== Summary of files with ENV email references ==="
grep -rl --include="*.ts" --include="*.tsx" --include="*.js" \
  -E "process\.env\.(SMTP_|EMAIL_)" \
  src/ 2>/dev/null | grep -v node_modules | grep -v ".next" | sort -u

echo ""
echo "=== Done ==="
