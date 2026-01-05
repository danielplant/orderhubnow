# Order Adjustments Feature - Testing Guide

## Prerequisites

1. **Run the SQL migration** on the production database:
   ```bash
   # Connect to your Azure SQL database and run:
   sql-migrations/2026-01-05-order-adjustments.sql
   ```

2. **Regenerate Prisma client** (if not done automatically):
   ```bash
   npx prisma generate
   ```

3. **Deploy the code changes** to production.

---

## Test Scenarios

### Test 1: Admin Login
1. Navigate to `https://www.orderhubnow.com/admin/login`
2. Enter credentials: `LimeAdmin` / `Green2022###!`
3. **Expected**: Redirect to admin dashboard

### Test 2: Orders Dashboard - New Columns
1. Navigate to `https://www.orderhubnow.com/admin/orders`
2. Look at the orders table columns
3. **Expected columns visible**:
   - Order # (clickable)
   - Store
   - Rep
   - Order Date
   - **Order Total** (original amount)
   - **Shipped Total** (new column - shows shipped value with difference indicator)
   - **Tracking** (new column - shows tracking number)
   - Sync status
4. If an order has a shipped amount different from order amount, it should show the difference in red/green

### Test 3: Click on Individual Order
1. From the orders dashboard, click on any order number
2. **Expected**: Navigate to `/admin/orders/{id}` detail page
3. **Verify the detail page shows**:
   - Order Info card (store, buyer, rep, email, etc.)
   - **Shipping Info card** (new - shows shipping cost, tracking, ship date, invoice #)
   - Notes section
   - Line Items table with columns: SKU, **Ordered**, **Shipped**, Unit, Total
   - **Edit forms for shipping and item adjustments** (new)
   - Comments section

### Test 4: Edit Shipping Info
1. On the order detail page, scroll to "Shipping & Invoice" section
2. Enter test values:
   - Shipping Cost: `25.00`
   - Tracking Number: `TEST123456789`
   - Ship Date: (select today's date)
   - Invoice Number: `INV-001`
3. Click "Save Shipping Info"
4. **Expected**: Success message, page refreshes, values persist

### Test 5: Adjust Shipped Quantities
1. On the order detail page, scroll to "Adjust Shipped Quantities" section
2. Modify one item's shipped quantity (e.g., reduce from 10 to 8)
3. **Observe**: Calculated Shipped Total updates automatically
4. Click "Save Item Adjustments"
5. **Expected**:
   - Success message with new shipped amount
   - Page refreshes
   - Order's shipped amount is updated
   - Dashboard should now show the difference

### Test 6: Compare with Old Site (inventory.limeapple.ca)
1. Open old site: `https://inventory.limeapple.ca/admin`
2. Login and navigate to orders
3. **Compare functionality**:
   - [ ] Can click on individual orders? ✓ (Both sites)
   - [ ] Can enter shipping costs? ✓ (New site has this)
   - [ ] Can enter tracking number? ✓ (New site has this)
   - [ ] Can adjust shipped quantities? ✓ (New site has this)
   - [ ] Shows shipped vs ordered difference? ✓ (New site has this)

### Test 7: Rep Order Placement Flow
1. Navigate to `https://www.orderhubnow.com/buyer/select-journey`
2. **Expected**: See options for ATS and Pre-Order
3. This is where reps/customers go to place new orders

---

## Database Verification

After running the migration, verify the columns exist:

```sql
-- Check CustomerOrders columns
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'CustomerOrders'
AND COLUMN_NAME IN ('ShippingCost', 'TrackingNumber', 'ShippedAmount', 'ShipDate', 'InvoiceNumber');

-- Check CustomerOrdersItems columns
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'CustomerOrdersItems'
AND COLUMN_NAME = 'ShippedQuantity';
```

**Expected results**:
- CustomerOrders should have: ShippingCost (FLOAT), TrackingNumber (NVARCHAR), ShippedAmount (FLOAT), ShipDate (DATETIME), InvoiceNumber (NVARCHAR)
- CustomerOrdersItems should have: ShippedQuantity (INT)

---

## Troubleshooting

### "Column does not exist" errors
- Run the SQL migration: `sql-migrations/2026-01-05-order-adjustments.sql`
- Regenerate Prisma: `npx prisma generate`

### Shipping form not appearing
- Clear browser cache
- Check browser console for errors
- Verify admin login session is valid

### Changes not persisting
- Check browser console for API errors
- Verify database user has UPDATE permissions

---

## Summary of Answers to Original Questions

1. **Where do reps/customers place orders?**
   - Reps: `/rep/orders` → "New Order" button → `/buyer/select-journey`
   - Customers: Directly to `/buyer/select-journey` → Choose ATS or Pre-Order

2. **Can you click on individual orders?**
   - Yes! Order # in the dashboard is clickable → goes to `/admin/orders/{id}`

3. **How is status updated (shipping costs, tracking, adjustments)?**
   - On the order detail page, there are now edit forms for:
     - Shipping Cost, Tracking Number, Ship Date, Invoice Number
     - Adjusting shipped quantities per line item
   - Changes are saved to the database and reflected in the dashboard

4. **Shipped Total column?**
   - Added to the orders dashboard
   - Shows shipped amount with red/green difference indicator
   - Calculated from shipped quantities × unit prices
