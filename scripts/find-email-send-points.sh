#!/bin/bash
# Find all places in the code where emails are sent
# Shows which function/method is used and what config source

echo "=== All Email Send Points in Codebase ==="
echo ""

echo "--- sendMailWithConfig calls (DB-based) ---"
grep -rn --include="*.ts" --include="*.tsx" "sendMailWithConfig" src/ 2>/dev/null | grep -v "export\|import\|function sendMailWithConfig"
echo ""

echo "--- sendOrderEmails calls ---"
grep -rn --include="*.ts" --include="*.tsx" "sendOrderEmails" src/ 2>/dev/null | grep -v "export\|import\|function sendOrderEmails"
echo ""

echo "--- sendShipmentEmails calls ---"
grep -rn --include="*.ts" --include="*.tsx" "sendShipmentEmails" src/ 2>/dev/null | grep -v "export\|import\|function sendShipmentEmails"
echo ""

echo "--- sendTrackingUpdateEmail calls ---"
grep -rn --include="*.ts" --include="*.tsx" "sendTrackingUpdateEmail" src/ 2>/dev/null | grep -v "export\|import\|function sendTrackingUpdateEmail"
echo ""

echo "--- getEmailSettings calls (DB config fetch) ---"
grep -rn --include="*.ts" --include="*.tsx" "getEmailSettings" src/ 2>/dev/null | grep -v "export\|import\|function getEmailSettings"
echo ""

echo "=== Done ==="
