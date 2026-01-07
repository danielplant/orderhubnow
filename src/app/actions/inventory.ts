"use server";

// Re-export domain types for backwards compatibility
export type {
  Product,
  ProductVariant,
  DashboardMetrics,
  CategoryMetric,
} from "@/lib/types";

import type { Product, ProductVariant, DashboardMetrics } from "@/lib/types";
import { sortBySize } from "@/lib/utils/size-sort";

// Internal Shopify API types (not exported)
interface ShopifyProductEdge {
  node: {
    title: string;
    metafield: {
      value: string;
    } | null;
  };
}

interface ShopifyResponse {
  data: {
    products: {
      edges: ShopifyProductEdge[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}

interface ShopifyVariantNode {
  sku: string;
  title: string;
  price: string;
  inventoryQuantity: number;
}

interface ShopifyProductDetailNode {
  id: string;
  title: string;
  productType: string;
  featuredImage: { url: string } | null;
  metafieldCollection: { value: string } | null;
  metafieldLabel: { value: string } | null;
  metafieldFabric: { value: string } | null;
  metafieldColor: { value: string } | null;
  metafieldPriceCad: { value: string } | null;
  metafieldPriceUsd: { value: string } | null;
  metafieldMsrpCad: { value: string } | null;
  metafieldMsrpUsd: { value: string } | null;
  variants: {
    edges: { node: ShopifyVariantNode }[];
  };
}

interface ShopifyProductsDetailResponse {
  data: {
    products: {
      edges: { node: ShopifyProductDetailNode }[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}

export async function getInventoryMetrics(): Promise<DashboardMetrics> {
  const { SHOPIFY_ACCESS_TOKEN, SHOPIFY_STORE_DOMAIN, SHOPIFY_API_VERSION } = process.env;

  if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
    return {
      ats: {
        total: 0,
        categories: [
          { name: 'Demo Collection A', count: 12 },
          { name: 'Demo Collection B', count: 7 },
          { name: 'Demo Collection C', count: 3 },
        ],
        totalCategories: 3,
      },
      preOrder: { total: 0, categories: [], totalCategories: 0 },
      lastUpdated: 'Demo (no Shopify creds)',
    }
  }

  // Fetch all products with pagination
  const endpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  try {
    const atsCounts: Record<string, number> = {};
    const preOrderCounts: Record<string, number> = {};
    let atsTotal = 0;
    let preOrderTotal = 0;

    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        {
          products(first: 250${cursor ? `, after: "${cursor}"` : ""}) {
            edges {
              cursor
              node {
                title
                metafield(namespace: "custom", key: "order_entry_collection") {
                  value
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query }),
        next: { revalidate: 300 },
      });

      if (!response.ok) {
        throw new Error(`Shopify API Error: ${response.statusText}`);
      }

      const json: ShopifyResponse = await response.json();
      const { edges, pageInfo } = json.data.products;

      // Process current page
      edges.forEach(({ node }) => {
        const rawValue = node.metafield?.value;
        if (!rawValue) return;

        const isPreOrder = rawValue.includes("PreOrder");
        const categories = parseCategories(rawValue);

        // If no valid categories found after parsing, default to General
        if (categories.length === 0) categories.push("General");

        if (isPreOrder) {
          preOrderTotal++;
          categories.forEach(cat => {
            preOrderCounts[cat] = (preOrderCounts[cat] || 0) + 1;
          });
        } else {
          atsTotal++;
          categories.forEach(cat => {
            atsCounts[cat] = (atsCounts[cat] || 0) + 1;
          });
        }
      });

      // Setup next page
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }

    // Transform to array and sort by count (descending)
    const toCategoryArray = (counts: Record<string, number>) => 
      Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    const atsCategories = toCategoryArray(atsCounts);
    const preOrderCategories = toCategoryArray(preOrderCounts);

    // Audit Log (Server-Side)
    console.log("\n--- INVENTORY AUDIT ---");
    console.log("Total Products Scanned:", atsTotal + preOrderTotal);
    console.log("ATS Categories Found:", atsCategories.map(c => `${c.name} (${c.count})`).join(", "));
    console.log("PreOrder Categories Found:", preOrderCategories.map(c => `${c.name} (${c.count})`).join(", "));
    console.log("-----------------------\n");

    return {
      ats: {
        total: atsTotal,
        categories: atsCategories, // Return ALL categories
        totalCategories: atsCategories.length
      },
      preOrder: {
        total: preOrderTotal,
        categories: preOrderCategories, // Return ALL categories
        totalCategories: preOrderCategories.length
      },
      lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

  } catch (error) {
    console.error("Failed to fetch inventory metrics:", error);
    // Return empty state on error to prevent page crash
    return {
      ats: { total: 0, categories: [], totalCategories: 0 },
      preOrder: { total: 0, categories: [], totalCategories: 0 },
      lastUpdated: "Error",
    };
  }
}

// Helper to normalize category name
function normalizeCategoryName(raw: string): string {
  return raw
    .replace(/PreOrder/gi, "")
    .trim()
    .replace(/\s+/g, " ");
}

// Helper to parse raw collection string into multiple categories
function parseCategories(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map(normalizeCategoryName)
    .filter((c) => c.length > 0 && c !== "General"); // Filter empty and default
}

// Helper to clean and parse price strings (removes currency symbols, handles whitespace)
function parsePrice(value: string | null | undefined): number {
  if (!value) return 0;
  // Remove '$', commas, whitespace, 'CAD', 'USD', etc. - keep only digits and decimal point
  const clean = value.replace(/[^\d.]/g, "");
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

// Helper to extract base SKU from variant SKU
function extractBaseSku(variantSku: string): string {
  if (!variantSku) return "Unknown";
  // SKU format: PREFIX-STYLE-COLOR-SIZE (e.g., "2PC-582P-SM-2/3")
  // We want to return everything except the last segment (size)
  const parts = variantSku.split("-");
  if (parts.length <= 1) return variantSku;
  // Remove the last part (size) and rejoin
  return parts.slice(0, -1).join("-");
}

// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to fetch a single page of products with retry logic
async function fetchProductPage(cursor: string | null, endpoint: string, token: string, retries = 3): Promise<ReturnType<typeof parseProductPage>> {
    const query = `
      {
        products(first: 250${cursor ? `, after: "${cursor}"` : ""}) {
          edges {
            node {
              id
              title
              productType
              featuredImage {
                url
              }
              metafieldCollection: metafield(namespace: "custom", key: "order_entry_collection") {
                value
              }
              metafieldLabel: metafield(namespace: "custom", key: "label_title") {
                value
              }
              metafieldFabric: metafield(namespace: "custom", key: "fabric") {
                value
              }
              metafieldColor: metafield(namespace: "custom", key: "color") {
                value
              }
              metafieldPriceCad: metafield(namespace: "custom", key: "cad_ws_price") {
                value
              }
              metafieldPriceUsd: metafield(namespace: "custom", key: "us_ws_price") {
                value
              }
              metafieldMsrpCad: metafield(namespace: "custom", key: "msrp_cad") {
                value
              }
              metafieldMsrpUsd: metafield(namespace: "custom", key: "msrp_us") {
                value
              }
              variants(first: 100) {
                edges {
                  node {
                    sku
                    title
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 300 },
  });

  const json = await response.json();

  // Handle rate limiting with retry
  if (json.errors?.some((e: { extensions?: { code?: string } }) => e.extensions?.code === "THROTTLED")) {
    if (retries > 0) {
      console.log(`Shopify rate limited. Waiting 2s before retry... (${retries} retries left)`);
      await delay(2000);
      return fetchProductPage(cursor, endpoint, token, retries - 1);
    }
    console.error("Shopify rate limit exceeded after retries");
    return { edges: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }

  if (!response.ok) {
    throw new Error(`Shopify API Error: ${response.statusText}`);
  }
  
  if (!json.data?.products) {
    console.error("Invalid Shopify response:", JSON.stringify(json).slice(0, 500));
    return { edges: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }
  
  return json.data.products;
}

// Type helper for the return
function parseProductPage(data: ShopifyProductsDetailResponse["data"]["products"]) {
  return data;
}

// Sales cache type (matches scripts/update-sales-cache.ts)
interface SalesCache {
  lastUpdated: string;
  lastOrderId: string | null;
  skuSales: Record<string, number>;
}

// Fetch popularity data from local cache file
// Cache is updated by running: npm run update-sales
async function fetchPopularityData(): Promise<Map<string, number>> {
  const popularityMap = new Map<string, number>();

  try {
    // Dynamic import for fs (server-side only)
    const fs = await import("fs");
    const path = await import("path");

    const cachePath = path.join(process.cwd(), "data", "sales-cache.json");

    if (!fs.existsSync(cachePath)) {
      console.log("Sales cache not found. Run 'npm run update-sales' to generate.");
      return popularityMap;
    }

    const cacheData = fs.readFileSync(cachePath, "utf-8");
    const cache: SalesCache = JSON.parse(cacheData);

    const skuSales = cache.skuSales;
    const skuCount = Object.keys(skuSales).length;

    if (skuCount === 0) {
      console.log("Sales cache is empty");
      return popularityMap;
    }

    // Sort SKUs by total sales (descending)
    const sortedSkus = Object.entries(skuSales).sort((a, b) => b[1] - a[1]);

    // Assign percentile rank (1 = top 1%, 100 = bottom 1%)
    sortedSkus.forEach(([sku, _quantity], index) => {
      const percentileRank = Math.ceil(((index + 1) / skuCount) * 100);
      popularityMap.set(sku, percentileRank);
    });

    console.log(`Loaded popularity data for ${popularityMap.size} SKUs from cache (updated: ${cache.lastUpdated})`);
  } catch (error) {
    console.error("Error reading sales cache:", error);
  }

  return popularityMap;
}

// Helper to clean string arrays (e.g. "['MULTI']")
function parseStringArray(value: string | null | undefined): string {
  if (!value) return "";
  try {
    // Handle JSON array string like "['MULTI']" or '["MULTI"]'
    // distinct from simple string "MULTI"
    if (value.startsWith("[") && value.endsWith("]")) {
      const clean = value.replace(/'/g, '"'); // Replace single quotes with double
      const parsed = JSON.parse(clean);
      return Array.isArray(parsed) ? parsed[0] : value;
    }
    return value;
  } catch {
    return value.replace(/[\[\]"']/g, ""); // Fallback cleanup
  }
}

export async function getProductsByCategory(category: string): Promise<Product[]> {
  const { SHOPIFY_ACCESS_TOKEN, SHOPIFY_STORE_DOMAIN, SHOPIFY_API_VERSION } = process.env;

  if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
    throw new Error("Missing Shopify credentials");
  }

  const endpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  // Fetch popularity data in parallel with product data
  const popularityPromise = fetchPopularityData();

  // Step 1: Collect all variants with their parent product metadata
  // This matches .NET behavior where each SKU row is processed individually
  type VariantWithParent = {
    variant: ShopifyVariantNode;
    parent: ShopifyProductDetailNode;
  };
  const allVariants: VariantWithParent[] = [];

  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const { edges, pageInfo } = await fetchProductPage(cursor, endpoint, SHOPIFY_ACCESS_TOKEN);

    edges.forEach(({ node }) => {
      const rawCollection = node.metafieldCollection?.value;
      if (!rawCollection) return;

      const categories = parseCategories(rawCollection);
      const isPreOrder = rawCollection.includes("PreOrder");

      // Only include ATS products matching the category
      // Check if the requested category exists in the product's categories
      if (isPreOrder || !categories.includes(category)) return;

      // Add each variant with its parent product reference
      node.variants.edges.forEach(({ node: v }) => {
        if (v.sku) {
          allVariants.push({ variant: v, parent: node });
        }
      });
    });

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  // Step 2: Group variants by base SKU (matches .NET grouping logic)
  // .NET groups by SkuID minus size, e.g., "2PC-582P-SM" from "2PC-582P-SM-2/3"
  const groupedByBaseSku = new Map<string, VariantWithParent[]>();

  allVariants.forEach((item) => {
    const baseSku = extractBaseSku(item.variant.sku);
    if (!groupedByBaseSku.has(baseSku)) {
      groupedByBaseSku.set(baseSku, []);
    }
    groupedByBaseSku.get(baseSku)!.push(item);
  });

  // Wait for popularity data
  const popularityMap = await popularityPromise;

  // Step 3: Create one Product per base SKU group (one card per color-style)
  const products: Product[] = [];

  groupedByBaseSku.forEach((items, baseSku) => {
    // Filter to only variants with available stock (matches .NET minQuantity filter)
    const availableItems = items.filter(
      ({ variant }) => variant.inventoryQuantity > 0
    );

    // Skip products with no available sizes (matches .NET behavior)
    if (availableItems.length === 0) return;

    const firstItem = availableItems[0];
    const parent = firstItem.parent;

    // Extract color code from SKU (last segment before size, e.g., "SM" from "582P-SM")
    const skuParts = baseSku.split("-");
    const colorCode = skuParts[skuParts.length - 1];
    const colorName = parseStringArray(parent.metafieldColor?.value) || colorCode;

    // Parse prices from parent metafields (both currencies)
    // Fallback to Shopify variant price if metafields missing
    const variantPrice = parsePrice(firstItem.variant.price);
    const priceCad = parsePrice(parent.metafieldPriceCad?.value) || variantPrice;
    const priceUsd = parsePrice(parent.metafieldPriceUsd?.value) || variantPrice;
    const msrpCad = parsePrice(parent.metafieldMsrpCad?.value);
    const msrpUsd = parsePrice(parent.metafieldMsrpUsd?.value);

    // Transform variants - only include those with stock
    // Deduplicate by SKU (same SKU may exist in multiple Shopify products)
    const seenSkus = new Set<string>();
    const variants: ProductVariant[] = [];
    
    availableItems.forEach(({ variant }) => {
      if (seenSkus.has(variant.sku)) return; // Skip duplicates
      seenSkus.add(variant.sku);
      
      // Extract size from SKU suffix (matches .NET logic: PREFIX-STYLE-COLOR-SIZE)
      const skuParts = variant.sku.split("-");
      const sizeFromSku = skuParts.length > 1 ? skuParts[skuParts.length - 1] : "OS";

      variants.push({
        size: sizeFromSku,
        sku: variant.sku,
        available: Math.max(0, variant.inventoryQuantity),
        onRoute: 0,
        priceCad,
        priceUsd,
      });
    });

    // Get popularity rank for this SKU
    // Only assign Best Seller status if product has sufficient inventory (>6 units)
    const rawPopularityRank = popularityMap.get(baseSku);
    const totalInventory = variants.reduce((sum, v) => sum + v.available, 0);
    const popularityRank = (totalInventory > 6 && rawPopularityRank !== undefined && rawPopularityRank <= 10)
      ? rawPopularityRank
      : undefined;

    products.push({
      id: `${parent.id}-${baseSku}`, // Unique ID per color-style combination
      skuBase: baseSku,
      title: parent.metafieldLabel?.value || parent.title,
      fabric: parent.metafieldFabric?.value || "",
      color: colorName,
      productType: parent.productType || "",
      priceCad,
      priceUsd,
      msrpCad,
      msrpUsd,
      imageUrl: parent.featuredImage?.url || "",
      variants,
      popularityRank, // Only set for top 10% with >6 units inventory
    });
  });

  console.log(`\n--- CATEGORY PRODUCTS: ${category} ---`);
  console.log(`Found ${products.length} products (grouped by base SKU)`);
  console.log("-----------------------------------\n");

  // Sort variants by size using Limeapple's specific size sequence
  return products.map((product) => ({
    ...product,
    variants: sortBySize(product.variants),
  }));
}

// ============================================================================
// PreOrder Shopify Types
// ============================================================================

// Simplified variant node (no inventoryLevels to stay under Shopify cost limit)
interface ShopifyPreOrderVariantNode {
  sku: string;
  title: string;
  price: string;
  inventoryQuantity: number;
}

interface ShopifyPreOrderProductNode {
  id: string;
  title: string;
  featuredImage: { url: string } | null;
  metafieldCollection: { value: string } | null;
  metafieldLabel: { value: string } | null;
  metafieldFabric: { value: string } | null;
  metafieldColor: { value: string } | null;
  metafieldPriceCad: { value: string } | null;
  metafieldPriceUsd: { value: string } | null;
  metafieldMsrpCad: { value: string } | null;
  metafieldMsrpUsd: { value: string } | null;
  variants: {
    edges: { node: ShopifyPreOrderVariantNode }[];
  };
}

// Helper to fetch PreOrder products with pagination
// Fetches all products and filters for those with PreOrder in metafield
async function fetchPreOrderProducts(
  endpoint: string,
  token: string
): Promise<{ node: ShopifyPreOrderProductNode }[]> {
  const allEdges: { node: ShopifyPreOrderProductNode }[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 20; // Safety limit: 20 pages * 250 = 5000 products max

  while (hasNextPage && pageCount < maxPages) {
    pageCount++;
    const query: string = `
      {
        products(first: 250${cursor ? `, after: "${cursor}"` : ""}) {
          edges {
            node {
              id
              title
              featuredImage {
                url
              }
              metafieldCollection: metafield(namespace: "custom", key: "order_entry_collection") {
                value
              }
              metafieldLabel: metafield(namespace: "custom", key: "label_title") {
                value
              }
              metafieldFabric: metafield(namespace: "custom", key: "fabric") {
                value
              }
              metafieldColor: metafield(namespace: "custom", key: "color") {
                value
              }
              metafieldPriceCad: metafield(namespace: "custom", key: "cad_ws_price") {
                value
              }
              metafieldPriceUsd: metafield(namespace: "custom", key: "us_ws_price") {
                value
              }
              metafieldMsrpCad: metafield(namespace: "custom", key: "msrp_cad") {
                value
              }
              metafieldMsrpUsd: metafield(namespace: "custom", key: "msrp_us") {
                value
              }
              variants(first: 50) {
                edges {
                  node {
                    sku
                    title
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const response: Response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query }),
      next: { revalidate: 300 },
    });

    const json: { data?: { products?: { edges: Array<{ node: ShopifyPreOrderProductNode }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }; errors?: Array<{ extensions?: { code?: string } }> } = await response.json();

    // Handle rate limiting with retry
    if (json.errors?.some((e: { extensions?: { code?: string } }) => e.extensions?.code === "THROTTLED")) {
      console.log(`Shopify rate limited on page ${pageCount}. Waiting 2s...`);
      await delay(2000);
      pageCount--; // Retry same page
      continue;
    }

    if (!response.ok) {
      throw new Error(`Shopify API Error: ${response.statusText}`);
    }

    if (!json.data?.products) {
      console.error("Invalid Shopify response:", JSON.stringify(json).slice(0, 500));
      break;
    }

    const { edges, pageInfo } = json.data.products;
    allEdges.push(...edges);

    // Check if we found any PreOrder products in this batch
    const preOrderInBatch = edges.filter(
      (e: { node: ShopifyPreOrderProductNode }) => e.node.metafieldCollection?.value?.includes("PreOrder")
    ).length;

    console.log(`[PreOrder] Page ${pageCount}: ${edges.length} products, ${preOrderInBatch} PreOrder`);

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  console.log(`[PreOrder] Total fetched: ${allEdges.length} products across ${pageCount} pages`);
  return allEdges;
}

// Helper to extract core category keyword from SQL category name
// SQL names: "SS26 Swim II (Jan 20 - Feb 15)" → "SWIM"
// Shopify metafield: "PreOrder SWIM" → "SWIM"
function extractCoreCategory(sqlCategoryName: string): string {
  // Known category keywords that appear in both SQL and Shopify
  const knownCategories = ["SWIM", "COZY", "ACTIVE", "RESORT", "PREPPY GOOSE", "HOLIDAY"];

  const upperName = sqlCategoryName.toUpperCase();

  // Check if any known category keyword appears in the SQL name
  for (const keyword of knownCategories) {
    if (upperName.includes(keyword)) {
      return keyword;
    }
  }

  // Fallback: return the original name (normalized)
  return sqlCategoryName.trim().toUpperCase();
}

/**
 * Get PreOrder products by category from Shopify API.
 *
 * This mirrors getProductsByCategory() but:
 * - Filters for PreOrder products (where metafield order_entry_collection contains "PreOrder")
 * - Includes products with available <= 0 (PreOrder shows items not yet in stock)
 * - Uses label_title metafield for product titles
 * - SKUs are clean (no DU3/DU9 prefix)
 *
 * Category matching: SQL category names (e.g., "SS26 Swim II (Jan 20 - Feb 15)") are matched
 * against Shopify metafield values (e.g., "SWIM") using core keyword extraction.
 *
 * NOTE: Single batch fetch for validation. Future phase will use SQL sync for full data.
 */
export async function getPreOrderProductsByCategory(category: string): Promise<Product[]> {
  const { SHOPIFY_ACCESS_TOKEN, SHOPIFY_STORE_DOMAIN, SHOPIFY_API_VERSION } = process.env;

  if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
    throw new Error("Missing Shopify credentials");
  }

  const endpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  // Extract core category keyword from SQL category name
  const coreCategory = extractCoreCategory(category);
  console.log(`[PreOrder] SQL category: "${category}" → Core keyword: "${coreCategory}"`);

  // Fetch single batch of products from Shopify
  const edges = await fetchPreOrderProducts(endpoint, SHOPIFY_ACCESS_TOKEN);

  console.log(`[PreOrder] Fetched ${edges.length} products from Shopify`);

  // Log first few products' metafield values for debugging
  edges.slice(0, 5).forEach(({ node }, i) => {
    console.log(`[PreOrder] Product ${i}: "${node.title}" - collection: "${node.metafieldCollection?.value || 'null'}"`);
  });

  // Collect variants matching category
  type VariantWithParent = {
    variant: ShopifyPreOrderVariantNode;
    parent: ShopifyPreOrderProductNode;
  };
  const allVariants: VariantWithParent[] = [];

  // Debug: track what categories we find
  const foundCategories = new Set<string>();
  let preOrderCount = 0;

  edges.forEach(({ node }) => {
    const rawCollection = node.metafieldCollection?.value;
    if (!rawCollection) return;

    // Must be a PreOrder product (contains "PreOrder" in metafield)
    const isPreOrder = rawCollection.includes("PreOrder");
    if (!isPreOrder) return;

    preOrderCount++;

    // Parse categories from metafield (removes "PreOrder" prefix)
    const shopifyCategories = parseCategories(rawCollection);
    shopifyCategories.forEach(c => foundCategories.add(c));

    // Match using core keyword comparison (case-insensitive)
    const matchesCategory = shopifyCategories.some(shopifyCat => {
      const shopifyCore = shopifyCat.trim().toUpperCase();
      return shopifyCore === coreCategory || shopifyCore.includes(coreCategory) || coreCategory.includes(shopifyCore);
    });

    if (!matchesCategory) return;

    // Add each variant with its parent product reference
    // Unlike ATS, we include ALL variants (even with 0 or negative stock)
    node.variants.edges.forEach(({ node: v }) => {
      if (v.sku) {
        allVariants.push({ variant: v, parent: node });
      }
    });
  });

  // Step 2: Group variants by base SKU
  const groupedByBaseSku = new Map<string, VariantWithParent[]>();

  allVariants.forEach((item) => {
    const baseSku = extractBaseSku(item.variant.sku);
    if (!groupedByBaseSku.has(baseSku)) {
      groupedByBaseSku.set(baseSku, []);
    }
    groupedByBaseSku.get(baseSku)!.push(item);
  });

  // Step 3: Create one Product per base SKU group
  const products: Product[] = [];

  groupedByBaseSku.forEach((items, baseSku) => {
    // For PreOrder, include ALL variants (not just those with stock)
    if (items.length === 0) return;

    const firstItem = items[0];
    const parent = firstItem.parent;

    // Extract color code from SKU
    const skuParts = baseSku.split("-");
    const colorCode = skuParts[skuParts.length - 1];
    const colorName = parseStringArray(parent.metafieldColor?.value) || colorCode;

    // Parse prices from parent metafields
    const variantPrice = parsePrice(firstItem.variant.price);
    const priceCad = parsePrice(parent.metafieldPriceCad?.value) || variantPrice;
    const priceUsd = parsePrice(parent.metafieldPriceUsd?.value) || variantPrice;
    const msrpCad = parsePrice(parent.metafieldMsrpCad?.value);
    const msrpUsd = parsePrice(parent.metafieldMsrpUsd?.value);

    // Transform variants - include all, deduplicate by SKU
    const seenSkus = new Set<string>();
    const variants: ProductVariant[] = [];

    items.forEach(({ variant }) => {
      if (seenSkus.has(variant.sku)) return;
      seenSkus.add(variant.sku);

      // Extract size from SKU suffix
      const skuParts = variant.sku.split("-");
      const sizeFromSku = skuParts.length > 1 ? skuParts[skuParts.length - 1] : "OS";

      // onRoute set to 0 for now - future SQL sync will provide this data
      variants.push({
        size: sizeFromSku,
        sku: variant.sku,
        available: Math.max(0, variant.inventoryQuantity),
        onRoute: 0,
        priceCad,
        priceUsd,
      });
    });

    products.push({
      id: `${parent.id}-${baseSku}`,
      skuBase: baseSku,
      title: parent.metafieldLabel?.value || parent.title,
      fabric: parent.metafieldFabric?.value || "",
      color: colorName,
      productType: "",  // PreOrder via Shopify API doesn't have productType in simplified query
      priceCad,
      priceUsd,
      msrpCad,
      msrpUsd,
      imageUrl: parent.featuredImage?.url || "",
      variants,
    });
  });

  console.log(`\n--- PREORDER CATEGORY PRODUCTS: ${category} ---`);
  console.log(`PreOrder products in batch: ${preOrderCount}`);
  console.log(`Categories found: ${Array.from(foundCategories).join(", ") || "none"}`);
  console.log(`Matched products: ${products.length}`);
  console.log("----------------------------------------------\n");

  // Sort variants by size using Limeapple's specific size sequence
  return products.map((product) => ({
    ...product,
    variants: sortBySize(product.variants),
  }));
}
