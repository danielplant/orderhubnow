#!/usr/bin/env node
/**
 * Step 3: Download JSONL and Save to RawSkusFromShopify
 * Run: node step3-download.js "<url>"
 * 
 * Based on .NET approach: download file, parse lines, save to DB
 */

const https = require('https');
const { PrismaClient } = require('@prisma/client');

const downloadUrl = process.argv[2];

if (!downloadUrl) {
  console.error('Usage: node step3-download.js "<url>"');
  process.exit(1);
}

const prisma = new PrismaClient();

function download(url) {
  return new Promise((resolve, reject) => {
    const makeRequest = (targetUrl) => {
      const protocol = targetUrl.startsWith('https') ? https : require('http');
      protocol.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          makeRequest(res.headers.location);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

// Parse JSONL - each line is a separate JSON object
// Structure: variant lines have embedded product, followed by related metafields/images/quantities
function parseJsonl(content) {
  const lines = content.trim().split('\n');
  const variants = new Map(); // variantId -> variant data
  const metafields = new Map(); // variantId -> { key: value }
  const quantities = new Map(); // variantId -> { incoming, committed }
  const images = new Map(); // variantId -> first image url
  
  console.log(`Parsing ${lines.length} lines...`);
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const item = JSON.parse(line);
      
      // Variant line - has id, sku, product embedded
      if (item.id && item.sku !== undefined && item.product) {
        variants.set(item.id, item);
      }
      // Metafield line
      else if (item.namespace && item.key && item.__parentId) {
        if (!metafields.has(item.__parentId)) {
          metafields.set(item.__parentId, {});
        }
        metafields.get(item.__parentId)[`${item.namespace}_${item.key}`] = item.value;
      }
      // Quantities line
      else if (item.quantities && item.__parentId) {
        const q = { incoming: 0, committed: 0 };
        for (const qty of item.quantities) {
          if (qty.name === 'incoming') q.incoming = qty.quantity;
          if (qty.name === 'committed') q.committed = qty.quantity;
        }
        quantities.set(item.__parentId, q);
      }
      // Image line
      else if (item.url && item.__parentId && !images.has(item.__parentId)) {
        images.set(item.__parentId, item.url);
      }
    } catch (e) {
      // Skip invalid lines
    }
  }
  
  console.log(`Found: ${variants.size} variants, ${metafields.size} metafield sets, ${quantities.size} quantity sets`);
  
  // Build final records
  const records = [];
  for (const [variantId, v] of variants) {
    if (!v.sku || v.sku.trim() === '') continue;
    
    const mf = metafields.get(variantId) || {};
    const q = quantities.get(variantId) || { incoming: 0, committed: 0 };
    const imgUrl = images.get(variantId) || null;
    
    // Extract size from selectedOptions
    let size = '';
    if (v.selectedOptions) {
      const sizeOpt = v.selectedOptions.find(o => o.name.toLowerCase() === 'size');
      if (sizeOpt) size = sizeOpt.value;
    }
    
    records.push({
      SkuID: v.sku,
      ShopifyId: BigInt(variantId.split('/').pop()),
      DisplayName: v.displayName || v.product?.title || '',
      Price: v.price ? parseFloat(v.price) : 0,
      Quantity: v.inventoryQuantity || 0,
      Size: size || '',
      AvailableForSale: v.inventoryQuantity > 0,
      RawShopifyId: variantId,
      productId: v.product?.id || null,
      ShopifyProductImageURL: imgUrl,
      metafield_fabric: mf['custom_fabric'] || null,
      metafield_color: mf['custom_color'] || null,
      metafield_cad_ws_price_test: mf['custom_cad_ws_price_test'] || null,
      metafield_usd_ws_price: mf['custom_usd_ws_price'] || null,
      metafield_msrp_cad: mf['custom_msrp_cad'] || null,
      metafield_msrp_us: mf['custom_msrp_us'] || null,
      metafield_order_entry_description: mf['custom_order_entry_description'] || null,
      metafield_order_entry_collection: mf['custom_order_entry_collection'] || null,
    });
  }
  
  return records;
}

async function main() {
  console.log('=== Step 3: Download and Save to SQL ===\n');
  
  try {
    console.log('Downloading JSONL file (this may take a moment)...');
    const content = await download(downloadUrl);
    console.log(`Downloaded ${(content.length / 1024 / 1024).toFixed(1)} MB\n`);
    
    const variants = parseJsonl(content);
    console.log(`\nReady to save ${variants.length} variants with SKUs`);
    
    if (variants.length === 0) {
      console.error('No variants found!');
      process.exit(1);
    }
    
    // Show sample
    console.log('\nSample variant:');
    console.log(JSON.stringify(variants[0], (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    
    // Truncate and insert
    console.log('\nTruncating RawSkusFromShopify...');
    await prisma.$executeRaw`TRUNCATE TABLE RawSkusFromShopify`;
    
    console.log('Inserting variants (this may take a few minutes)...');
    let inserted = 0;
    
    let errors = 0;
    let lastError = '';
    for (const v of variants) {
      try {
        await prisma.rawSkusFromShopify.create({ data: v });
        inserted++;
        if (inserted % 500 === 0) {
          process.stdout.write(`\rInserted ${inserted}/${variants.length}`);
        }
      } catch (e) {
        errors++;
        lastError = e.message;
        if (errors === 1) {
          console.log('\nFirst error:', e.message);
          console.log('Problem record:', JSON.stringify(v, (k,val) => typeof val === 'bigint' ? val.toString() : val, 2));
        }
      }
    }
    if (errors > 0) {
      console.log(`\nTotal errors: ${errors}`);
      console.log('Last error:', lastError);
    }
    process.stdout.write(`\rInserted ${inserted}/${variants.length}`);
    
    console.log('\n\n=== SUCCESS ===');
    console.log(`Saved ${inserted} variants to RawSkusFromShopify`);
    
    // Verify
    const count = await prisma.rawSkusFromShopify.count();
    console.log(`Verified: ${count} rows in RawSkusFromShopify`);
    
    console.log('\n=== Next Step ===');
    console.log('Run: node step4-transform.js');
    
  } catch (err) {
    console.error('\nError:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
