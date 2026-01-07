/**
 * ATS Title/Image Discrepancy Audit Script
 *
 * Run with: node scripts/ats-audit.js
 *
 * This script performs Phase 1 & Phase 2 of the audit:
 * - Phase 1A: Find baseSku groups with inconsistent title/image across sizes
 * - Phase 1B: Find SKUs with missing OrderEntryDescription (title fallback risk)
 * - Phase 1C: Find images shared across many different baseSkus
 * - Phase 2: Compare Sku table vs RawSkusFromShopify for transform issues
 */

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function runAudit() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(__dirname, "..", "audit-results");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("=".repeat(60));
  console.log("ATS Title/Image Discrepancy Audit");
  console.log("=".repeat(60));
  console.log("");

  // Get categories first
  console.log("Fetching categories...");
  const categories = await prisma.skuCategories.findMany({
    where: { IsPreOrder: false },
    orderBy: { SortOrder: "asc" }
  });
  console.log("ATS Categories:");
  categories.forEach(c => console.log(`  ID=${c.ID}: ${c.Name}`));
  console.log("");

  // Phase 1A: Find baseSku groups with inconsistent title/image across sizes
  console.log("-".repeat(60));
  console.log("Phase 1A: BaseSku groups with inconsistent OED or Image");
  console.log("-".repeat(60));

  const phase1a = await prisma.$queryRaw`
    WITH S AS (
      SELECT
        *,
        LEFT(SkuID, LEN(SkuID) - CHARINDEX('-', REVERSE(SkuID))) AS BaseSku
      FROM Sku
      WHERE ShowInPreOrder = 0
        AND CHARINDEX('-', SkuID) > 0
    )
    SELECT
      CategoryID,
      BaseSku,
      COUNT(*) AS [RowCount],
      COUNT(DISTINCT ISNULL(OrderEntryDescription, '')) AS DistinctOED,
      COUNT(DISTINCT ISNULL(Description, '')) AS DistinctDesc,
      COUNT(DISTINCT ISNULL(ShopifyImageURL, '')) AS DistinctImg
    FROM S
    GROUP BY CategoryID, BaseSku
    HAVING
      COUNT(DISTINCT ISNULL(OrderEntryDescription, '')) > 1
      OR COUNT(DISTINCT ISNULL(ShopifyImageURL, '')) > 1
    ORDER BY DistinctImg DESC, DistinctOED DESC
  `;

  console.log(`Found ${phase1a.length} baseSku groups with inconsistencies`);
  if (phase1a.length > 0) {
    console.log("\nTop 20 examples:");
    phase1a.slice(0, 20).forEach(row => {
      console.log(`  Cat=${row.CategoryID} BaseSku=${row.BaseSku}: ${row['RowCount']} rows, ${row.DistinctOED} OEDs, ${row.DistinctImg} images`);
    });
  }
  fs.writeFileSync(
    path.join(outputDir, `phase1a-inconsistent-groups-${timestamp}.json`),
    JSON.stringify(phase1a, null, 2)
  );

  // Phase 1B: Find SKUs with missing OrderEntryDescription
  console.log("\n" + "-".repeat(60));
  console.log("Phase 1B: SKUs with missing OrderEntryDescription (title fallback risk)");
  console.log("-".repeat(60));

  const phase1b = await prisma.$queryRaw`
    SELECT
      CategoryID,
      SkuID,
      Description,
      OrderEntryDescription,
      ShopifyImageURL
    FROM Sku
    WHERE ShowInPreOrder = 0
      AND (OrderEntryDescription IS NULL OR LTRIM(RTRIM(OrderEntryDescription)) = '')
      AND (Description IS NOT NULL AND LTRIM(RTRIM(Description)) <> '')
    ORDER BY CategoryID, SkuID
  `;

  console.log(`Found ${phase1b.length} SKUs with missing OrderEntryDescription`);
  if (phase1b.length > 0) {
    console.log("\nTop 20 examples:");
    phase1b.slice(0, 20).forEach(row => {
      console.log(`  Cat=${row.CategoryID} ${row.SkuID}: Desc="${row.Description?.substring(0, 40)}..." OED="${row.OrderEntryDescription || 'NULL'}"`);
    });
  }
  fs.writeFileSync(
    path.join(outputDir, `phase1b-missing-oed-${timestamp}.json`),
    JSON.stringify(phase1b, null, 2)
  );

  // Phase 1C: Find images shared across many different baseSkus
  console.log("\n" + "-".repeat(60));
  console.log("Phase 1C: Images shared across multiple baseSkus (product-image fallback)");
  console.log("-".repeat(60));

  const phase1c = await prisma.$queryRaw`
    SELECT
      ShopifyImageURL,
      COUNT(*) AS TotalUses,
      COUNT(DISTINCT LEFT(SkuID, LEN(SkuID) - CHARINDEX('-', REVERSE(SkuID)))) AS DistinctBaseSkus
    FROM Sku
    WHERE ShowInPreOrder = 0
      AND ShopifyImageURL IS NOT NULL
      AND LTRIM(RTRIM(ShopifyImageURL)) <> ''
      AND CHARINDEX('-', SkuID) > 0
    GROUP BY ShopifyImageURL
    HAVING COUNT(DISTINCT LEFT(SkuID, LEN(SkuID) - CHARINDEX('-', REVERSE(SkuID)))) >= 3
    ORDER BY DistinctBaseSkus DESC, TotalUses DESC
  `;

  console.log(`Found ${phase1c.length} images shared across 3+ baseSkus`);
  if (phase1c.length > 0) {
    console.log("\nTop 20 examples:");
    phase1c.slice(0, 20).forEach(row => {
      console.log(`  ${row.DistinctBaseSkus} baseSkus, ${row.TotalUses} total uses: ${row.ShopifyImageURL?.substring(0, 60)}...`);
    });
  }
  fs.writeFileSync(
    path.join(outputDir, `phase1c-shared-images-${timestamp}.json`),
    JSON.stringify(phase1c, null, 2)
  );

  // Phase 2: DB vs Raw sync comparison
  console.log("\n" + "-".repeat(60));
  console.log("Phase 2: Sku vs RawSkusFromShopify comparison");
  console.log("-".repeat(60));

  const phase2 = await prisma.$queryRaw`
    SELECT
      s.CategoryID,
      s.SkuID,
      s.Description AS Sku_Description,
      s.OrderEntryDescription AS Sku_OED,
      s.ShopifyImageURL AS Sku_ImageURL,
      r.DisplayName AS Raw_DisplayName,
      r.metafield_order_entry_description AS Raw_LabelTitle,
      r.ShopifyProductImageURL AS Raw_ImageURL
    FROM Sku s
    LEFT JOIN RawSkusFromShopify r
      ON UPPER(r.SkuID) = UPPER(s.SkuID)
    WHERE s.ShowInPreOrder = 0
    ORDER BY s.CategoryID, s.SkuID
  `;

  // Analyze transform mismatches
  const transformMismatches = phase2.filter(row => {
    // Raw has label_title but Sku OED is empty
    const oedMismatch = row.Raw_LabelTitle &&
      (!row.Sku_OED || row.Sku_OED.trim() === '') &&
      row.Raw_LabelTitle.trim() !== '';

    // Image URLs differ
    const imgMismatch = row.Raw_ImageURL &&
      row.Sku_ImageURL !== row.Raw_ImageURL;

    return oedMismatch || imgMismatch;
  });

  console.log(`Total SKUs checked: ${phase2.length}`);
  console.log(`Transform mismatches found: ${transformMismatches.length}`);

  if (transformMismatches.length > 0) {
    console.log("\nTop 20 transform mismatches:");
    transformMismatches.slice(0, 20).forEach(row => {
      const issues = [];
      if (row.Raw_LabelTitle && (!row.Sku_OED || row.Sku_OED.trim() === '')) {
        issues.push("OED empty but Raw has label_title");
      }
      if (row.Raw_ImageURL && row.Sku_ImageURL !== row.Raw_ImageURL) {
        issues.push("Image mismatch");
      }
      console.log(`  ${row.SkuID}: ${issues.join(", ")}`);
    });
  }

  fs.writeFileSync(
    path.join(outputDir, `phase2-full-comparison-${timestamp}.json`),
    JSON.stringify(phase2, null, 2)
  );
  fs.writeFileSync(
    path.join(outputDir, `phase2-transform-mismatches-${timestamp}.json`),
    JSON.stringify(transformMismatches, null, 2)
  );

  // Summary report
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Phase 1A: ${phase1a.length} baseSku groups with inconsistent OED/image`);
  console.log(`Phase 1B: ${phase1b.length} SKUs with missing OrderEntryDescription`);
  console.log(`Phase 1C: ${phase1c.length} images shared across 3+ baseSkus`);
  console.log(`Phase 2: ${transformMismatches.length} transform mismatches`);
  console.log("");
  console.log(`Results saved to: ${outputDir}`);

  // Export combined CSV for easy viewing
  const csvRows = [];
  csvRows.push([
    "source", "category_id", "base_sku", "sku_id", "issue_type",
    "sku_oed", "sku_desc", "sku_image",
    "raw_label_title", "raw_image", "distinct_oed", "distinct_images"
  ].join(","));

  // Add Phase 1A rows
  for (const row of phase1a) {
    csvRows.push([
      "phase1a", row.CategoryID, `"${row.BaseSku}"`, "", "inconsistent_group",
      "", "", "", "", "", row.DistinctOED, row.DistinctImg
    ].join(","));
  }

  // Add Phase 1B rows
  for (const row of phase1b) {
    csvRows.push([
      "phase1b", row.CategoryID, "", `"${row.SkuID}"`, "missing_oed",
      `"${row.OrderEntryDescription || ''}"`, `"${(row.Description || '').replace(/"/g, '""')}"`,
      `"${row.ShopifyImageURL || ''}"`, "", "", "", ""
    ].join(","));
  }

  // Add Phase 2 transform mismatches
  for (const row of transformMismatches) {
    csvRows.push([
      "phase2", row.CategoryID, "", `"${row.SkuID}"`, "transform_mismatch",
      `"${row.Sku_OED || ''}"`, `"${(row.Sku_Description || '').replace(/"/g, '""')}"`,
      `"${row.Sku_ImageURL || ''}"`, `"${(row.Raw_LabelTitle || '').replace(/"/g, '""')}"`,
      `"${row.Raw_ImageURL || ''}"`, "", ""
    ].join(","));
  }

  fs.writeFileSync(
    path.join(outputDir, `audit-summary-${timestamp}.csv`),
    csvRows.join("\n")
  );

  await prisma.$disconnect();
  console.log("\nAudit complete!");
}

runAudit().catch(e => {
  console.error("Audit failed:", e);
  process.exit(1);
});
