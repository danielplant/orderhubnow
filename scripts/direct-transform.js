const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

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
      const catName = part.replace(/PreOrder/g, "").trim();
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
