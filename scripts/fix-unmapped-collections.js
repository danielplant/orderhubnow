const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Step 1: Create new SkuCategories for unmapped collections
 * Step 2: Add normalization rules to handle typos/variations
 */

async function main() {
  console.log("=".repeat(80));
  console.log("FIXING UNMAPPED COLLECTIONS");
  console.log("=".repeat(80));
  console.log("");

  // ========================================================================
  // STEP 1: Create new SkuCategories
  // ========================================================================
  console.log("STEP 1: Creating new SkuCategories...");
  console.log("-".repeat(80));

  const newCategories = [
    // The 3 FW2026 pre-order collections Devika mentioned
    { Name: "FW26 PG Core1 (Jul 01 to Aug 15)", IsPreOrder: true, SortOrder: 100 },
    { Name: "FW26 PG Plush2 (Jul 15 to Aug 30)", IsPreOrder: true, SortOrder: 101 },
    { Name: "Holiday26 PG (Sep 01 to Sep 30)", IsPreOrder: true, SortOrder: 102 },

    // FW26 Preppy Goose collections
    { Name: "FW26 Preppy Goose", IsPreOrder: false, SortOrder: 103 },
    { Name: "FW26 Preppy Goose", IsPreOrder: true, SortOrder: 104 },
    { Name: "FW26 Preppy Goose Boys", IsPreOrder: false, SortOrder: 105 },

    // Other missing categories
    { Name: "Core Collection", IsPreOrder: false, SortOrder: 106 },
    { Name: "FW24 Preppy Goose", IsPreOrder: false, SortOrder: 107 },

    // "Almost Gone" without "- Last Call" suffix (maps to existing)
    // We need this as ATS category since some products just have "Almost Gone"
    { Name: "Almost Gone", IsPreOrder: false, SortOrder: 108 },
  ];

  for (const cat of newCategories) {
    // Check if already exists
    const existing = await prisma.skuCategories.findFirst({
      where: {
        Name: cat.Name,
        IsPreOrder: cat.IsPreOrder,
      },
    });

    if (existing) {
      console.log(`  SKIP: "${cat.Name}" (IsPreOrder=${cat.IsPreOrder}) already exists (ID: ${existing.ID})`);
    } else {
      const created = await prisma.skuCategories.create({
        data: {
          Name: cat.Name,
          IsPreOrder: cat.IsPreOrder,
          SortOrder: cat.SortOrder,
        },
      });
      console.log(`  CREATED: "${cat.Name}" (IsPreOrder=${cat.IsPreOrder}) -> ID: ${created.ID}`);
    }
  }

  console.log("");
  console.log("STEP 1 COMPLETE");
  console.log("");

  // ========================================================================
  // STEP 2: Show what normalization rules are needed in sync.ts
  // ========================================================================
  console.log("STEP 2: Normalization rules needed in sync.ts");
  console.log("-".repeat(80));
  console.log("");
  console.log("The following normalizations need to be added to transformToSkuTable():");
  console.log("");
  console.log("  1. Trim leading/trailing spaces from category names");
  console.log("  2. 'Jul 151' -> 'Jul 15' (typo fix)");
  console.log("  3. 'PreOrderPreOrder' -> 'PreOrder' (double suffix)");
  console.log("  4. 'Holiday 2025Preppy Goose' -> 'Holiday 2025 Preppy Goose' (missing space)");
  console.log("  5. 'Holiday Preppy Goose 2025' -> 'Holiday 2025 Preppy Goose' (word order)");
  console.log("  6. 'Almost Gone -  Last Call' -> 'Almost Gone - Last Call' (extra space)");
  console.log("  7. 'FW26 Preppy Goose 2026' -> 'FW26 Preppy Goose' (redundant 2026)");
  console.log("");

  // ========================================================================
  // Verify current state
  // ========================================================================
  console.log("VERIFICATION: Current SkuCategories count");
  console.log("-".repeat(80));
  const totalCats = await prisma.skuCategories.count();
  const preorderCats = await prisma.skuCategories.count({ where: { IsPreOrder: true } });
  const atsCats = await prisma.skuCategories.count({ where: { IsPreOrder: false } });
  console.log(`  Total: ${totalCats}, PreOrder: ${preorderCats}, ATS: ${atsCats}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
