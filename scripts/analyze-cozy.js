const data = require('../audit-results/phase2-full-comparison-2026-01-07T00-52-36-156Z.json');
const cozy = data.filter(r => r.CategoryID === 157);
console.log('\n=== COZY CATEGORY (157) - Full SKU List ===');
console.log('Total SKUs:', cozy.length);

// Group by baseSku
const grouped = {};
cozy.forEach(r => {
  const baseSku = r.SkuID.substring(0, r.SkuID.lastIndexOf('-'));
  if (!grouped[baseSku]) grouped[baseSku] = [];
  grouped[baseSku].push(r);
});

// Show all baseSkus
console.log('\nBase SKUs in Cozy:');
Object.keys(grouped).sort().forEach(base => {
  const rows = grouped[base];
  const images = [...new Set(rows.map(r => r.Sku_ImageURL))];
  const oeds = [...new Set(rows.map(r => r.Sku_OED || 'NULL'))];
  console.log(`  ${base}: ${rows.length} sizes, ${images.length} images, OED: ${oeds[0] ? oeds[0].substring(0, 30) : 'NULL'}`);
});

// Show 600C-BLK and 600C-VPTD in detail (the ones with 2 images)
['600C-BLK', '600C-VPTD'].forEach(base => {
  if (grouped[base]) {
    console.log('\n--- ' + base + ' (PROBLEM: 2 distinct images) ---');
    grouped[base].forEach(r => {
      console.log('SKU:', r.SkuID);
      console.log('  Sku_OED:', r.Sku_OED || 'NULL');
      console.log('  Sku_Desc:', (r.Sku_Description || '').substring(0, 60));
      console.log('  Sku_Image:', (r.Sku_ImageURL || ''));
      console.log('  Raw_LabelTitle:', r.Raw_LabelTitle || 'NULL');
      console.log('  Raw_Image:', (r.Raw_ImageURL || ''));
      console.log('');
    });
  }
});
