#!/usr/bin/env node
/**
 * Diagnostic Script: Issues #1 (OnRoute) and #3 (LULU-FC)
 * 
 * Run this when you have database connectivity to diagnose:
 * - Issue #1: Why OnRoute is blank in PreOrder
 * - Issue #3: What LULU-FC size values look like in the database
 * 
 * Usage: node scripts/diagnose-issues-1-and-3.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log('='.repeat(60));
    console.log('ISSUE #3: LULU-FC Size Data');
    console.log('='.repeat(60));
    console.log('Checking what size values are stored for LULU-FC SKUs...\n');
    
    const lulufc = await prisma.$queryRaw`
      SELECT SkuID, Size FROM Sku WHERE SkuID LIKE 'LULU-FC%' ORDER BY SkuID
    `;
    
    if (lulufc.length === 0) {
      console.log('No LULU-FC SKUs found in Sku table.\n');
    } else {
      console.log(`Found ${lulufc.length} LULU-FC SKUs:`);
      console.table(lulufc);
      
      // Analyze size formats
      const sizeFormats = new Set(lulufc.map(r => r.Size));
      console.log('\nUnique size values:', Array.from(sizeFormats).join(', '));
      
      const hasHyphenatedMonths = lulufc.some(r => /\d+-\d+M/i.test(r.Size));
      console.log('Contains hyphenated month sizes (e.g., 12-18M):', hasHyphenatedMonths ? 'YES' : 'NO');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('ISSUE #1: OnRoute Data Pipeline');
    console.log('='.repeat(60));
    
    // Check 1: Is Incoming data being captured from Shopify?
    console.log('\n1. Checking RawSkusInventoryLevelFromShopify for Incoming > 0...');
    const incoming = await prisma.$queryRaw`
      SELECT TOP 20 ParentId, Incoming, CommittedQuantity 
      FROM RawSkusInventoryLevelFromShopify 
      WHERE Incoming > 0
    `;
    
    if (incoming.length === 0) {
      console.log('   ❌ NO incoming inventory data found in raw sync table.');
      console.log('   → The Shopify bulk sync may not be capturing "incoming" quantities.');
      console.log('   → Check if a sync has been run recently.');
    } else {
      console.log(`   ✓ Found ${incoming.length}+ rows with Incoming > 0`);
      console.table(incoming.slice(0, 5));
    }
    
    // Check 2: What are current OnRoute values for PreOrder SKUs?
    console.log('\n2. Checking current OnRoute values in Sku table (PreOrder only)...');
    const preorder = await prisma.$queryRaw`
      SELECT TOP 20 SkuID, OnRoute, Quantity, ShowInPreOrder 
      FROM Sku 
      WHERE ShowInPreOrder = 1
      ORDER BY OnRoute DESC
    `;
    
    const hasOnRouteValues = preorder.some(r => r.OnRoute && r.OnRoute > 0);
    if (!hasOnRouteValues) {
      console.log('   ❌ All PreOrder SKUs have OnRoute = 0 or NULL');
      console.log('   → This confirms the transform is not mapping OnRoute.');
    } else {
      console.log('   ✓ Some PreOrder SKUs have OnRoute values:');
      console.table(preorder.filter(r => r.OnRoute > 0).slice(0, 10));
    }
    
    // Check 3: Can we join the data?
    console.log('\n3. Testing join path: Sku → RawSkusFromShopify → RawSkusInventoryLevelFromShopify...');
    const joinTest = await prisma.$queryRaw`
      SELECT TOP 20 
        S.SkuID, 
        S.OnRoute AS CurrentOnRoute,
        RIL.Incoming AS ShopifyIncoming
      FROM Sku S
      JOIN RawSkusFromShopify RS ON S.ShopifyProductVariantId = RS.ShopifyId
      JOIN RawSkusInventoryLevelFromShopify RIL ON CAST(RIL.ParentId AS BIGINT) = RS.ShopifyId
      WHERE S.ShowInPreOrder = 1
        AND RIL.Incoming > 0
    `;
    
    if (joinTest.length === 0) {
      console.log('   ❌ No rows returned from join.');
      console.log('   → Either no incoming data, or join path is broken.');
      
      // Diagnose further
      console.log('\n   Diagnosing join path...');
      
      const skuCount = await prisma.$queryRaw`
        SELECT COUNT(*) as cnt FROM Sku WHERE ShowInPreOrder = 1 AND ShopifyProductVariantId IS NOT NULL
      `;
      console.log(`   - PreOrder SKUs with ShopifyProductVariantId: ${skuCount[0].cnt}`);
      
      const rawCount = await prisma.$queryRaw`
        SELECT COUNT(*) as cnt FROM RawSkusFromShopify WHERE ShopifyId IS NOT NULL
      `;
      console.log(`   - RawSkusFromShopify with ShopifyId: ${rawCount[0].cnt}`);
      
      const invCount = await prisma.$queryRaw`
        SELECT COUNT(*) as cnt FROM RawSkusInventoryLevelFromShopify WHERE Incoming > 0
      `;
      console.log(`   - RawSkusInventoryLevelFromShopify with Incoming > 0: ${invCount[0].cnt}`);
    } else {
      console.log(`   ✓ Join works! Found ${joinTest.length}+ mappable rows:`);
      console.table(joinTest);
      console.log('\n   → The fix should work: map RIL.Incoming to Sku.OnRoute during transform.');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log('Run a Shopify sync (Admin → Shopify → Sync Now) and then re-run this script');
    console.log('to verify data is flowing correctly.');
    
  } catch (err) {
    console.error('\nError:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
