#!/usr/bin/env node
/**
 * Diagnostic Script: PreOrder Missing Sizes
 *
 * Compares the current app's PreOrder filtering to .NET behavior.
 *
 * .NET filter: (Quantity < 1 OR ShowInPreOrder = true)
 * Current app: ShowInPreOrder = true only
 *
 * This script identifies products where sizes are missing due to the stricter filter.
 *
 * Run: node scripts/diagnose-preorder-sizes.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== PreOrder Missing Sizes Diagnostic ===\n');

  try {
    // 1. Get all PreOrder categories
    const preOrderCategories = await prisma.skuCategories.findMany({
      where: { IsPreOrder: true },
      select: { ID: true, Name: true },
    });

    console.log(`Found ${preOrderCategories.length} PreOrder categories:\n`);
    preOrderCategories.forEach(c => console.log(`  - [${c.ID}] ${c.Name}`));
    console.log('');

    // 2. For each category, find products where current app shows fewer sizes than .NET would
    let totalAffectedProducts = 0;
    let totalMissingSizes = 0;
    const affectedProducts = [];

    for (const category of preOrderCategories) {
      // Get all SKUs in this category
      const skus = await prisma.sku.findMany({
        where: { CategoryID: category.ID },
        select: {
          SkuID: true,
          Quantity: true,
          ShowInPreOrder: true,
          Size: true,
          Description: true,
        },
      });

      // Group by base SKU (everything before the last dash)
      const productMap = new Map();

      for (const sku of skus) {
        const lastDash = sku.SkuID.lastIndexOf('-');
        const baseSku = lastDash > 0 ? sku.SkuID.substring(0, lastDash) : sku.SkuID;

        if (!productMap.has(baseSku)) {
          productMap.set(baseSku, {
            baseSku,
            description: sku.Description,
            variants: [],
          });
        }
        productMap.get(baseSku).variants.push(sku);
      }

      // Analyze each product
      for (const [baseSku, product] of productMap) {
        const totalVariants = product.variants.length;

        // Current app: ShowInPreOrder = true
        const currentAppCount = product.variants.filter(v => v.ShowInPreOrder === true).length;

        // .NET: ShowInPreOrder = true OR Quantity < 1
        const dotNetCount = product.variants.filter(v =>
          v.ShowInPreOrder === true || (v.Quantity !== null && v.Quantity < 1)
        ).length;

        if (currentAppCount < dotNetCount) {
          const missingSizes = dotNetCount - currentAppCount;
          totalAffectedProducts++;
          totalMissingSizes += missingSizes;

          affectedProducts.push({
            category: category.Name,
            baseSku,
            description: product.description,
            totalVariants,
            currentAppShows: currentAppCount,
            dotNetWouldShow: dotNetCount,
            missingSizes,
            variants: product.variants.map(v => ({
              sku: v.SkuID,
              size: v.Size,
              qty: v.Quantity,
              showInPreOrder: v.ShowInPreOrder,
              currentAppShows: v.ShowInPreOrder === true,
              dotNetWouldShow: v.ShowInPreOrder === true || (v.Quantity !== null && v.Quantity < 1),
            })),
          });
        }
      }
    }

    // 3. Print summary
    console.log('=== SUMMARY ===\n');
    console.log(`Total affected products: ${totalAffectedProducts}`);
    console.log(`Total missing sizes: ${totalMissingSizes}`);
    console.log('');

    if (affectedProducts.length === 0) {
      console.log('✅ No discrepancies found! Current app matches .NET behavior.');
    } else {
      console.log('=== AFFECTED PRODUCTS (first 10) ===\n');

      const toShow = affectedProducts.slice(0, 10);
      for (const p of toShow) {
        console.log(`📦 ${p.baseSku} (${p.category})`);
        console.log(`   Description: ${p.description || 'N/A'}`);
        console.log(`   Current app shows: ${p.currentAppShows} sizes`);
        console.log(`   .NET would show: ${p.dotNetWouldShow} sizes`);
        console.log(`   Missing: ${p.missingSizes} sizes`);
        console.log('');

        // Show which sizes are missing
        const missingVariants = p.variants.filter(v => v.dotNetWouldShow && !v.currentAppShows);
        if (missingVariants.length > 0) {
          console.log('   Missing sizes:');
          for (const v of missingVariants) {
            console.log(`     - ${v.size} (qty: ${v.qty}, showInPreOrder: ${v.showInPreOrder})`);
          }
          console.log('');
        }
      }

      if (affectedProducts.length > 10) {
        console.log(`... and ${affectedProducts.length - 10} more products affected.\n`);
      }

      // 4. Print the fix recommendation
      console.log('=== RECOMMENDED FIX ===\n');
      console.log('Update src/lib/data/queries/preorder.ts line ~143:');
      console.log('');
      console.log('FROM:');
      console.log('  where: {');
      console.log('    CategoryID: categoryId,');
      console.log('    ShowInPreOrder: true,');
      console.log('  },');
      console.log('');
      console.log('TO:');
      console.log('  where: {');
      console.log('    CategoryID: categoryId,');
      console.log('    OR: [');
      console.log('      { ShowInPreOrder: true },');
      console.log('      { Quantity: { lt: 1 } },');
      console.log('    ],');
      console.log('  },');
    }

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
