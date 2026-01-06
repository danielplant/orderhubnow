# PDF Download Showing Blank

## Priority: MEDIUM

## Problem

Devika reported blank PDF when downloading order confirmation (file named `A8108-Confirmation.pdf`). The PDF file downloads but contains no content.

## Current Implementation

- `src/lib/pdf/generate.ts` - Uses Puppeteer + @sparticuz/chromium
- `src/lib/pdf/order-confirmation.ts` - HTML template for order confirmations
- `src/app/api/orders/[id]/pdf/route.ts` - API endpoint

The PDF generation uses:
- `puppeteer-core` for browser automation
- `@sparticuz/chromium` for serverless-optimized Chromium binary

## Investigation Steps

### 1. Test PDF locally
```bash
curl http://localhost:3000/api/orders/8108/pdf -o test.pdf
open test.pdf
```

### 2. Test HTML output (debug mode)
```bash
curl "http://localhost:3000/api/orders/8108/pdf?debug=html" -o test.html
open test.html
```
This returns raw HTML instead of PDF - check if HTML looks correct.

### 3. Check if Chromium is installed on EC2
SSH into EC2 and check:
```bash
which chromium
ls -la /tmp/chromium*
```

### 4. Check server logs
Look for errors during PDF generation:
```bash
pm2 logs | grep -i "pdf\|chromium\|puppeteer"
```

### 5. Check memory usage
Chromium requires significant memory. Check if EC2 has enough:
```bash
free -m
```

## Potential Causes

1. **Chromium not installed** - @sparticuz/chromium may not have downloaded the binary
2. **Memory issues** - Chromium needs ~500MB+ RAM
3. **Missing fonts** - System fonts not available for rendering
4. **Timeout** - PDF generation taking too long
5. **Order data empty** - No line items in the order

## Files to Check

```
src/lib/pdf/generate.ts        # Line 54: executablePath
src/lib/pdf/order-confirmation.ts  # HTML template
src/app/api/orders/[id]/pdf/route.ts  # Line 90: generatePdf call
```

## Potential Fixes

### If Chromium missing:
```bash
# On EC2, install chromium dependencies
sudo apt-get install -y chromium-browser
```

### If memory issue:
Consider using a lighter PDF library like `jspdf` or `pdfkit` instead of Puppeteer.

### If timeout:
Increase timeout in puppeteer launch options.

## Effort Estimate
- Investigation: 1 hour
- Fix: 1-3 hours depending on cause
