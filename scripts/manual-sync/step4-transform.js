#!/usr/bin/env node
/**
 * Step 4: Transform RawSkusFromShopify → Sku table
 * THIS IS THE SWITCHOVER - Sku table will have CLEAN SKUs after this
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Step 4: Transform to Sku Table ===\n');
  console.log('WARNING: This will replace all data in Sku table!\n');
  
  try {
    // 1. Create backup
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').split('.')[0];
    const backupTable = `Sku_backup_${timestamp}`;
    
    console.log(`Creating backup: ${backupTable}...`);
    await prisma.$executeRawUnsafe(`SELECT * INTO ${backupTable} FROM Sku`);
    const backupCount = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM ${backupTable}`);
    console.log(`Backup created with ${backupCount[0].cnt} rows\n`);
    
    // 2. Load categories
    const categories = await prisma.skuCategories.findMany();
    const categoryByName = new Map();
    for (const cat of categories) {
      categoryByName.set(cat.Name.toLowerCase().trim(), { id: cat.ID, isPreOrder: cat.IsPreOrder });
    }
    console.log(`Loaded ${categories.length} categories`);
    
    // 3. Load PPSizes for categories 399/401
    const ppSizes = await prisma.pPSizes.findMany();
    const ppSizeMap = new Map();
    for (const pp of ppSizes) {
      ppSizeMap.set(pp.Size, pp.CorrespondingPP);
    }
    console.log(`Loaded ${ppSizeMap.size} PPSize mappings`);
    
    // 4. Preserve existing DisplayPriority
    const existingPriorities = new Map();
    const existingSkus = await prisma.sku.findMany({
      select: { SkuID: true, DisplayPriority: true }
    });
    for (const sku of existingSkus) {
      if (sku.DisplayPriority != null) {
        existingPriorities.set(sku.SkuID, sku.DisplayPriority);
      }
    }
    console.log(`Preserved ${existingPriorities.size} DisplayPriority values\n`);
    
    // 5. Load raw data
    const rawSkus = await prisma.rawSkusFromShopify.findMany();
    console.log(`Processing ${rawSkus.length} raw SKUs...`);
    
    // 6. Transform
    const skuRecords = [];
    let matched = 0, skipped = 0;
    
    for (const raw of rawSkus) {
      if (!raw.SkuID || !raw.metafield_order_entry_collection) {
        skipped++;
        continue;
      }
      
      // Parse collection (can be comma-separated)
      const collections = raw.metafield_order_entry_collection.split(',').map(c => c.trim());
      
      let categoryMatch = null;
      let isPreOrder = false;
      
      for (const coll of collections) {
        // Check for PreOrder prefix
        const collLower = coll.toLowerCase();
        if (collLower.includes('preorder')) {
          isPreOrder = true;
          const cleanName = coll.replace(/preorder/gi, '').trim().toLowerCase();
          const cat = categoryByName.get(cleanName);
          if (cat && cat.isPreOrder) {
            categoryMatch = cat;
            break;
          }
        } else {
          const cat = categoryByName.get(collLower);
          if (cat) {
            categoryMatch = cat;
            break;
          }
        }
      }
      
      if (!categoryMatch) {
        skipped++;
        continue;
      }
      
      // Parse color from metafield
      let skuColor = '';
      if (raw.metafield_color) {
        try {
          const colors = JSON.parse(raw.metafield_color);
          skuColor = Array.isArray(colors) ? colors.join(', ') : raw.metafield_color;
        } catch {
          skuColor = raw.metafield_color.replace(/[\[\]"]/g, '').trim();
        }
      }
      
      // Format price
      const priceCAD = raw.metafield_cad_ws_price_test || '';
      const priceUSD = raw.metafield_usd_ws_price || '';
      const priceDisplay = priceCAD && priceUSD ? `CAD: ${priceCAD} / USD: ${priceUSD}` : '';
      
      // Handle PP categories 399/401 size mapping
      let sizeValue = raw.Size || '';
      if (categoryMatch.id === 399 || categoryMatch.id === 401) {
        const skuParts = raw.SkuID.split('-');
        const lastPart = skuParts[skuParts.length - 1];
        const sizeNum = parseInt(lastPart, 10);
        
        if (!isNaN(sizeNum)) {
          let lookupSize = sizeNum;
          if (categoryMatch.id === 401) {
            if (sizeNum === 3) lookupSize = 33;
            else if (sizeNum === 4) lookupSize = 44;
          }
          const ppSize = ppSizeMap.get(lookupSize);
          sizeValue = ppSize || sizeNum.toString();
        }
      }
      
      // Get preserved DisplayPriority
      const displayPriority = existingPriorities.get(raw.SkuID.toUpperCase()) || 10000;
      
      skuRecords.push({
        SkuID: raw.SkuID.toUpperCase(),  // CLEAN SKU - NO PREFIX!
        Description: raw.DisplayName,
        Quantity: raw.Quantity,
        Price: priceDisplay || null,
        Size: sizeValue,
        FabricContent: raw.metafield_fabric,
        SkuColor: skuColor || null,
        CategoryID: categoryMatch.id,
        OnRoute: 0,
        PriceCAD: priceCAD || null,
        PriceUSD: priceUSD || null,
        ShowInPreOrder: isPreOrder,
        OrderEntryDescription: raw.metafield_order_entry_description,
        MSRPCAD: raw.metafield_msrp_cad,
        MSRPUSD: raw.metafield_msrp_us,
        DisplayPriority: displayPriority,
        ShopifyProductVariantId: raw.ShopifyId,
        ShopifyImageURL: raw.ShopifyProductImageURL,
      });
      
      matched++;
    }
    
    console.log(`\nMatched: ${matched}, Skipped: ${skipped}`);
    console.log(`Ready to insert ${skuRecords.length} clean SKUs\n`);
    
    if (skuRecords.length === 0) {
      console.error('ERROR: No records to insert!');
      process.exit(1);
    }
    
    // 7. Truncate and insert
    console.log('Truncating Sku table...');
    await prisma.$executeRaw`TRUNCATE TABLE Sku`;
    
    console.log('Inserting clean SKUs...');
    let inserted = 0;
    for (const rec of skuRecords) {
      try {
        await prisma.sku.create({ data: rec });
        inserted++;
        if (inserted % 100 === 0) {
          process.stdout.write(`\rInserted ${inserted}/${skuRecords.length}`);
        }
      } catch (e) {
        // Skip errors
      }
    }
    
    console.log(`\n\n=== SUCCESS ===`);
    console.log(`Inserted ${inserted} clean SKUs into Sku table`);
    console.log(`Backup available: ${backupTable}`);
    
    // Verify
    const finalCount = await prisma.sku.count();
    console.log(`\nVerified: ${finalCount} rows in Sku table`);
    
    // Show sample
    const sample = await prisma.sku.findFirst();
    if (sample) {
      console.log('\nSample SKU (should be CLEAN - no DU3/DU9 prefix):');
      console.log(`  SkuID: ${sample.SkuID}`);
      console.log(`  Description: ${sample.Description}`);
      console.log(`  CategoryID: ${sample.CategoryID}`);
    }
    
  } catch (err) {
    console.error('\nError:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
