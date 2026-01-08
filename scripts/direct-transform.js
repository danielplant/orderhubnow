const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

/**
 * Normalize category names to handle typos and variations in Shopify data.
 */
function normalizeCategoryName(name) {
  let normalized = name.trim();

  // Fix common typos
  normalized = normalized.replace(/Jul 151/gi, "Jul 15"); // typo: 151 -> 15
  normalized = normalized.replace(/PreOrderPreOrder/g, "PreOrder"); // double suffix

  // Fix spacing issues
  normalized = normalized.replace(/\s+/g, " "); // collapse multiple spaces to single
  normalized = normalized.replace(/(\w)- /g, "$1 - "); // ensure space before dash
  normalized = normalized.replace(/ -(\w)/g, " - $1"); // ensure space after dash

  // Fix known naming variations
  // "Holiday 2025Preppy Goose" -> "Holiday 2025 Preppy Goose"
  normalized = normalized.replace(/(\d{4})([A-Z])/g, "$1 $2");

  // "Holiday Preppy Goose 2025" -> "Holiday 2025 Preppy Goose"
  if (/^Holiday Preppy Goose 2025$/i.test(normalized)) {
    normalized = "Holiday 2025 Preppy Goose";
  }

  // "FW26 Preppy Goose 2026" -> "FW26 Preppy Goose" (redundant year)
  normalized = normalized.replace(/^(FW\d{2} Preppy Goose) 20\d{2}$/i, "$1");

  return normalized;
}

async function run() {
  const start = Date.now();
  
  // Get all categories
  const categories = await p.skuCategories.findMany();
  const catMap = new Map();
  for (const c of categories) {
    catMap.set(c.Name.toLowerCase() + "_" + (c.IsPreOrder ? "1" : "0"), c.ID);
  }
  
  // Get raw SKUs
  const rawSkus = await p.$queryRawUnsafe(`
    SELECT * FROM RawSkusFromShopify
    WHERE SkuID LIKE '%-%'
      AND metafield_order_entry_collection IS NOT NULL
      AND metafield_order_entry_collection NOT LIKE '%GROUP%'
      AND ISNULL(metafield_cad_ws_price_test, '') <> ''
      AND ISNULL(metafield_usd_ws_price, '') <> ''
      AND ISNULL(metafield_msrp_cad, '') <> ''
      AND ISNULL(metafield_msrp_us, '') <> ''
  `);
  console.log("Raw SKUs to process:", rawSkus.length);
  
  // Build inserts - split collection by comma, exact match each
  const inserts = [];
  for (const r of rawSkus) {
    const collection = r.metafield_order_entry_collection.replace(/Pre-Order/g, "PreOrder");
    const parts = collection.split(",").map(s => s.trim());
    
    for (const part of parts) {
      const isPreOrder = part.includes("PreOrder");
      const catName = normalizeCategoryName(part.replace(/PreOrder/g, ""));
      const key = catName.toLowerCase() + "_" + (isPreOrder ? "1" : "0");
      const catId = catMap.get(key);
      
      if (catId) {
        inserts.push({
          SkuID: r.SkuID.toUpperCase(),
          Description: r.DisplayName,
          Quantity: r.Quantity,
          Price: `CAD: ${r.metafield_cad_ws_price_test} / USD: ${r.metafield_usd_ws_price}`,
          Size: r.Size || "",
          FabricContent: r.metafield_fabric,
          SkuColor: (r.metafield_color || "").replace(/[\[\]"]/g, ""),
          CategoryID: catId,
          PriceCAD: r.metafield_cad_ws_price_test,
          PriceUSD: r.metafield_usd_ws_price,
          ShowInPreOrder: isPreOrder,
          OrderEntryDescription: r.metafield_order_entry_description,
          MSRPCAD: r.metafield_msrp_cad,
          MSRPUSD: r.metafield_msrp_us,
          DisplayPriority: 10000,
          ShopifyProductVariantId: r.ShopifyId,
          ShopifyImageURL: r.ShopifyProductImageURL,
        });
      }
    }
  }
  console.log("Records to insert:", inserts.length);
  
  // Truncate and bulk insert
  await p.$executeRawUnsafe("TRUNCATE TABLE Sku");
  
  // Insert in batches of 500
  for (let i = 0; i < inserts.length; i += 500) {
    const batch = inserts.slice(i, i + 500);
    await p.sku.createMany({ data: batch });
  }
  
  // Remove duplicates
  await p.$executeRawUnsafe(`
    WITH CTE AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY SkuID, CategoryID ORDER BY ID DESC) AS rn FROM Sku
    )
    DELETE FROM CTE WHERE rn > 1
  `);
  
  const count = await p.sku.count();
  console.log("Final count:", count, "in", Date.now() - start, "ms");
  
  await p.$disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
