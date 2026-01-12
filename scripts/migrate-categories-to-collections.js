const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Migration Script: Categories to Collections
 *
 * This script migrates data from the old SkuCategories system to the new Collections system.
 *
 * Steps:
 * 1. Copy SkuCategories → Collection (preserving IDs for image paths)
 * 2. Build ShopifyValueMapping entries from RawSkusFromShopify
 * 3. Auto-map obvious matches where collection name appears in raw value
 *
 * IMPORTANT: Run the SQL migration (manual_add_collections.sql) BEFORE running this script!
 */

async function main() {
  console.log("=".repeat(80));
  console.log("MIGRATING CATEGORIES TO COLLECTIONS");
  console.log("=".repeat(80));
  console.log("");

  // ========================================================================
  // STEP 1: Migrate SkuCategories → Collection
  // ========================================================================
  console.log("STEP 1: Migrating SkuCategories to Collection...");
  console.log("-".repeat(80));

  const categories = await prisma.skuCategories.findMany({
    where: {
      Name: { not: "Defective" }, // Exclude defective categories
    },
    orderBy: { SortOrder: "asc" },
  });

  console.log(`Found ${categories.length} categories to migrate`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const cat of categories) {
    // Check if already migrated
    const existing = await prisma.collection.findFirst({
      where: { id: cat.ID },
    });

    if (existing) {
      console.log(`  SKIP: "${cat.Name}" (ID: ${cat.ID}) - already exists`);
      skippedCount++;
      continue;
    }

    // Determine type based on IsPreOrder flag
    const type = cat.IsPreOrder ? "PreOrder" : "ATS";

    // Create collection with same ID (for image path compatibility)
    try {
      // Use raw SQL to insert with specific ID (Prisma doesn't allow setting identity)
      await prisma.$executeRaw`
        SET IDENTITY_INSERT [Collection] ON;
        INSERT INTO [Collection] ([ID], [Name], [Type], [SortOrder], [ImageUrl], [ShipWindowStart], [ShipWindowEnd], [IsActive], [CreatedAt], [UpdatedAt])
        VALUES (${cat.ID}, ${cat.Name}, ${type}, ${cat.SortOrder || 0}, ${`/SkuImages/${cat.ID}.jpg`}, ${cat.OnRouteAvailableDate}, ${cat.OnRouteAvailableDateEnd}, 1, GETDATE(), GETDATE());
        SET IDENTITY_INSERT [Collection] OFF;
      `;

      console.log(`  MIGRATED: "${cat.Name}" (ID: ${cat.ID}, Type: ${type})`);
      migratedCount++;
    } catch (err) {
      console.error(`  ERROR migrating "${cat.Name}": ${err.message}`);
    }
  }

  console.log("");
  console.log(`Step 1 complete: ${migratedCount} migrated, ${skippedCount} skipped`);
  console.log("");

  // ========================================================================
  // STEP 2: Build ShopifyValueMapping from RawSkusFromShopify
  // ========================================================================
  console.log("STEP 2: Building ShopifyValueMapping entries...");
  console.log("-".repeat(80));

  // Get all unique collection values from raw Shopify data
  const rawSkus = await prisma.rawSkusFromShopify.findMany({
    select: {
      metafield_order_entry_collection: true,
    },
    where: {
      metafield_order_entry_collection: { not: null },
    },
  });

  console.log(`Found ${rawSkus.length} raw SKUs with collection data`);

  // Count occurrences of each raw value
  const valueCounts = new Map();
  for (const r of rawSkus) {
    const collection = r.metafield_order_entry_collection || "";
    const parts = collection.split(",").map((s) => s.trim()).filter(Boolean);

    for (const rawValue of parts) {
      valueCounts.set(rawValue, (valueCounts.get(rawValue) || 0) + 1);
    }
  }

  console.log(`Found ${valueCounts.size} unique raw Shopify values`);

  // Create or update mappings
  let createdCount = 0;
  let updatedCount = 0;

  for (const [rawValue, count] of valueCounts) {
    const existing = await prisma.shopifyValueMapping.findUnique({
      where: { rawValue },
    });

    if (existing) {
      await prisma.shopifyValueMapping.update({
        where: { id: existing.id },
        data: {
          skuCount: count,
          lastSeenAt: new Date(),
        },
      });
      updatedCount++;
    } else {
      await prisma.shopifyValueMapping.create({
        data: {
          rawValue,
          status: "unmapped",
          skuCount: count,
        },
      });
      createdCount++;
    }
  }

  console.log(`Created ${createdCount} new mappings, updated ${updatedCount} existing`);
  console.log("");

  // ========================================================================
  // STEP 3: Auto-map obvious matches
  // ========================================================================
  console.log("STEP 3: Auto-mapping obvious matches...");
  console.log("-".repeat(80));

  // Get all collections
  const collections = await prisma.collection.findMany();
  const collectionsByName = new Map();
  for (const c of collections) {
    // Store by lowercase name for case-insensitive matching
    collectionsByName.set(c.name.toLowerCase(), c);
  }

  // Get all unmapped values
  const unmappedMappings = await prisma.shopifyValueMapping.findMany({
    where: { status: "unmapped" },
  });

  console.log(`Found ${unmappedMappings.length} unmapped values to check`);

  let autoMappedCount = 0;

  for (const mapping of unmappedMappings) {
    const rawValue = mapping.rawValue;

    // Try to find a matching collection
    // Strategy: Remove "PreOrder" or "Pre-Order" suffix and check if remaining matches a collection name
    let cleanedValue = rawValue
      .replace(/\s*PreOrder\s*/gi, "")
      .replace(/\s*Pre-Order\s*/gi, "")
      .trim();

    const matchedCollection = collectionsByName.get(cleanedValue.toLowerCase());

    if (matchedCollection) {
      await prisma.shopifyValueMapping.update({
        where: { id: mapping.id },
        data: {
          collectionId: matchedCollection.id,
          status: "mapped",
        },
      });
      console.log(`  MAPPED: "${rawValue}" -> "${matchedCollection.name}" (ID: ${matchedCollection.id})`);
      autoMappedCount++;
    }
  }

  console.log("");
  console.log(`Step 3 complete: ${autoMappedCount} auto-mapped`);
  console.log("");

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log("=".repeat(80));
  console.log("MIGRATION SUMMARY");
  console.log("=".repeat(80));

  const totalCollections = await prisma.collection.count();
  const totalMappings = await prisma.shopifyValueMapping.count();
  const mappedMappings = await prisma.shopifyValueMapping.count({ where: { status: "mapped" } });
  const unmappedMappingsCount = await prisma.shopifyValueMapping.count({ where: { status: "unmapped" } });

  console.log(`Collections: ${totalCollections}`);
  console.log(`Shopify Value Mappings: ${totalMappings}`);
  console.log(`  - Mapped: ${mappedMappings}`);
  console.log(`  - Unmapped: ${unmappedMappingsCount}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Review unmapped values in the admin UI");
  console.log("  2. Map remaining values to collections");
  console.log("  3. Run Shopify sync to populate SKUs with CollectionID");
  console.log("");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
