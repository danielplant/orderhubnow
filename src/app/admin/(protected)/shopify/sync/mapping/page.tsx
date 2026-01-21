'use client';

import { ArrowRight, Database, ShoppingBag, Lock, Info } from 'lucide-react';
import Link from 'next/link';

/**
 * Shopify Sync Mapping - Read-Only Documentation
 *
 * This page documents the ACTUAL hardcoded sync pipeline that has been
 * working for months. The sync is NOT configurable through this UI -
 * it shows what the code does.
 *
 * The real sync logic lives in: src/lib/shopify/sync.ts
 *
 * ============================================================================
 * 2026-01-20: FUTURE PLAN - Making This Automatic & Configurable
 * ============================================================================
 *
 * CURRENT STATE:
 * - The diagram below is MANUALLY hardcoded by reading sync.ts
 * - If sync.ts changes, this documentation becomes stale
 * - No connection between actual code and this UI
 *
 * GOAL:
 * - Single source of truth that BOTH executes sync AND generates this UI
 * - Changes to pipeline automatically reflected in documentation
 * - Eventually: configurable pipelines without code changes
 *
 * HOW TO IMPLEMENT:
 *
 * 1. Create a Pipeline Definition Schema:
 *    ```typescript
 *    // src/lib/sync-service/types/pipeline.ts
 *    interface PipelineDefinition {
 *      id: string;
 *      name: string;
 *      source: {
 *        type: 'Shopify';
 *        resource: string;  // 'ProductVariant', 'Collection', etc.
 *        fields: FieldDefinition[];  // What to fetch
 *      };
 *      stages: StageDefinition[];
 *      postProcessing: PostProcessStep[];
 *    }
 *
 *    interface StageDefinition {
 *      name: string;
 *      targetTable: string;
 *      mappings: FieldMapping[];  // source -> target with transform
 *      filters: FilterDefinition[];
 *    }
 *
 *    interface PostProcessStep {
 *      name: string;
 *      type: 'thumbnail-generation' | 'backup-cleanup' | 'webhook-notify';
 *      config: Record<string, unknown>;
 *    }
 *    ```
 *
 * 2. Define Current Pipeline as Config:
 *    ```typescript
 *    // src/lib/sync-service/pipelines/product-variant-to-sku.ts
 *    export const PRODUCT_VARIANT_PIPELINE: PipelineDefinition = {
 *      id: 'product-variant-to-sku',
 *      name: 'Product Sync',
 *      source: {
 *        type: 'Shopify',
 *        resource: 'ProductVariant',
 *        fields: [
 *          { field: 'id', description: 'Shopify variant GID' },
 *          { field: 'sku', description: 'SKU identifier' },
 *          // ... all fields from SHOPIFY_FIELDS_FETCHED below
 *        ],
 *      },
 *      stages: [
 *        {
 *          name: 'Raw Ingestion',
 *          targetTable: 'RawSkusFromShopify',
 *          mappings: [...],  // from STAGE1_MAPPINGS below
 *          filters: [],
 *        },
 *        {
 *          name: 'Transform to Sku',
 *          targetTable: 'Sku',
 *          mappings: [...],  // from STAGE2_MAPPINGS below
 *          filters: [...],   // from TRANSFORM_FILTERS below
 *        },
 *      ],
 *      postProcessing: [
 *        { name: 'Thumbnails', type: 'thumbnail-generation', config: {} },
 *        { name: 'Backup Cleanup', type: 'backup-cleanup', config: { retentionDays: 7 } },
 *      ],
 *    };
 *    ```
 *
 * 3. Refactor sync.ts to Read from Pipeline Definition:
 *    - GraphQL query generated from source.fields
 *    - Stage 1 mappings drive upsertShopifyVariant()
 *    - Stage 2 mappings drive transformToSkuTable()
 *    - Filters applied from stage.filters
 *    - Post-processing steps executed in order
 *
 * 4. This UI Reads from Same Definition:
 *    - Import PRODUCT_VARIANT_PIPELINE
 *    - Render diagram from pipeline.stages
 *    - Generate tables from pipeline.stages[n].mappings
 *    - Always in sync because same source of truth
 *
 * 5. Future: Store Pipelines in Database:
 *    - Move from code config to SyncPipeline table
 *    - UI can create/edit pipelines
 *    - Sync engine loads pipeline from DB
 *    - Full configurability without code changes
 *
 * MIGRATION PATH:
 * Phase 1: Extract current hardcoded values to pipeline definition file (code)
 * Phase 2: Refactor sync.ts to consume the definition
 * Phase 3: Update this UI to render from definition
 * Phase 4: Move definition to database for runtime configurability
 *
 * ============================================================================
 */

// The actual GraphQL fields fetched (from BULK_OPERATION_QUERY in sync.ts)
const SHOPIFY_FIELDS_FETCHED = [
  { field: 'id', description: 'Shopify variant GID' },
  { field: 'sku', description: 'SKU identifier' },
  { field: 'price', description: 'Variant price' },
  { field: 'inventoryQuantity', description: 'Stock quantity' },
  { field: 'displayName', description: 'Full display name' },
  { field: 'title', description: 'Variant title (often size)' },
  { field: 'selectedOptions', description: 'Size, Color options' },
  { field: 'image.url', description: 'Variant image URL' },
  { field: 'product.id', description: 'Parent product GID' },
  { field: 'product.title', description: 'Product title' },
  { field: 'product.status', description: 'ACTIVE/DRAFT/ARCHIVED' },
  { field: 'product.productType', description: 'Product type' },
  { field: 'product.featuredMedia.preview.image.url', description: 'Product image URL' },
  { field: 'metafield: order_entry_collection', description: 'Collection assignment (comma-separated)' },
  { field: 'metafield: label_title', description: 'Order entry description' },
  { field: 'metafield: fabric', description: 'Fabric content' },
  { field: 'metafield: color', description: 'Color value' },
  { field: 'metafield: test_number_ (CAD WS)', description: 'CAD wholesale price' },
  { field: 'metafield: us_ws_price', description: 'USD wholesale price' },
  { field: 'metafield: msrp_cad', description: 'CAD MSRP' },
  { field: 'metafield: msrp_us', description: 'USD MSRP' },
  { field: 'inventoryItem.measurement.weight', description: 'Weight data' },
  { field: 'inventoryItem.inventoryLevels', description: 'Incoming/committed quantities' },
];

// Stage 1: Raw ingestion mappings (Shopify → RawSkusFromShopify)
const STAGE1_MAPPINGS = [
  { source: 'id (GID)', target: 'RawShopifyId, ShopifyId', transform: 'GID string + parsed BigInt' },
  { source: 'sku', target: 'SkuID', transform: 'Direct' },
  { source: 'price', target: 'Price', transform: 'parseFloat' },
  { source: 'inventoryQuantity', target: 'Quantity', transform: 'Direct' },
  { source: 'displayName', target: 'DisplayName', transform: 'Direct' },
  { source: 'selectedOptions[size]', target: 'Size', transform: 'Find option named "size"' },
  { source: 'image.url || product.featuredMedia', target: 'ShopifyProductImageURL', transform: 'Variant image or product fallback' },
  { source: 'product.id', target: 'productId', transform: 'Direct' },
  { source: 'product.productType', target: 'ProductType', transform: 'Direct' },
  { source: 'product.status', target: 'ProductStatus', transform: 'Direct' },
  { source: 'metafield: order_entry_collection', target: 'metafield_order_entry_collection', transform: 'Direct' },
  { source: 'metafield: label_title', target: 'metafield_order_entry_description', transform: 'Direct' },
  { source: 'metafield: fabric', target: 'metafield_fabric', transform: 'Direct' },
  { source: 'metafield: color', target: 'metafield_color', transform: 'Direct' },
  { source: 'metafield: test_number_', target: 'metafield_cad_ws_price', transform: 'Direct' },
  { source: 'metafield: us_ws_price', target: 'metafield_usd_ws_price', transform: 'Direct' },
  { source: 'metafield: msrp_cad', target: 'metafield_msrp_cad', transform: 'Direct' },
  { source: 'metafield: msrp_us', target: 'metafield_msrp_us', transform: 'Direct' },
  { source: 'inventoryItem.id', target: 'InventoryItemId', transform: 'Parsed from GID' },
  { source: 'inventoryItem.measurement.weight', target: 'VariantWeight, VariantWeightUnit', transform: 'Direct' },
];

// Stage 2: Transform mappings (RawSkusFromShopify → Sku)
const STAGE2_MAPPINGS = [
  { source: 'SkuID', target: 'SkuID', transform: 'toUpperCase()' },
  { source: 'DisplayName', target: 'Description', transform: 'Direct' },
  { source: 'Quantity', target: 'Quantity', transform: 'Direct' },
  { source: 'Size', target: 'Size', transform: 'Direct' },
  { source: 'metafield_fabric', target: 'FabricContent', transform: 'Direct' },
  { source: 'metafield_color', target: 'SkuColor', transform: 'Remove brackets/quotes' },
  { source: 'ProductType', target: 'ProductType', transform: 'Direct' },
  { source: 'metafield_order_entry_collection', target: 'CollectionID', transform: '⚡ Split by comma, lookup ShopifyValueMapping → Collection' },
  { source: 'metafield_cad_ws_price', target: 'PriceCAD', transform: 'Direct' },
  { source: 'metafield_usd_ws_price', target: 'PriceUSD', transform: 'Direct' },
  { source: 'metafield_msrp_cad', target: 'MSRPCAD', transform: 'Direct' },
  { source: 'metafield_msrp_us', target: 'MSRPUSD', transform: 'Direct' },
  { source: 'metafield_order_entry_description', target: 'OrderEntryDescription', transform: 'Direct' },
  { source: 'SkuID prefix', target: 'UnitsPerSku', transform: '⚡ Parse "2PC-" → 2, "6PC-" → 6, etc.' },
  { source: 'PriceCAD / UnitsPerSku', target: 'UnitPriceCAD', transform: '⚡ Calculated' },
  { source: 'PriceUSD / UnitsPerSku', target: 'UnitPriceUSD', transform: '⚡ Calculated' },
  { source: 'Collection.type', target: 'ShowInPreOrder', transform: '⚡ true if collection type = "PreOrder"' },
  { source: 'ShopifyId', target: 'ShopifyProductVariantId', transform: 'Direct' },
  { source: 'ShopifyProductImageURL', target: 'ShopifyImageURL', transform: 'Direct' },
  { source: 'Incoming - Committed', target: 'OnRoute', transform: '⚡ Calculated from inventory levels' },
];

// Filters applied during transform
const TRANSFORM_FILTERS = [
  { filter: 'SkuID LIKE \'%-%\'', reason: 'Must contain hyphen (valid SKU format)' },
  { filter: 'order_entry_collection IS NOT NULL', reason: 'Must have collection assignment' },
  { filter: 'order_entry_collection NOT LIKE \'%GROUP%\'', reason: 'Exclude group collections' },
  { filter: 'All 4 prices must be set', reason: 'CAD WS, USD WS, MSRP CAD, MSRP USD required' },
  { filter: 'ProductStatus = ACTIVE (configurable)', reason: 'Controlled by sync filter config' },
];

export default function MappingsPage() {
  return (
    <main className="p-6 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">Sync Mapping</h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
            <Lock className="h-3 w-3" />
            Read-Only
          </span>
        </div>
        <p className="text-muted-foreground">
          Documents the hardcoded sync pipeline. Changes require code modifications in{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">src/lib/shopify/sync.ts</code>
        </p>
      </div>

      {/* Pipeline Overview */}
      <div className="mb-8 p-4 rounded-lg border border-border bg-card">
        <h2 className="font-semibold mb-4">Pipeline Overview</h2>
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
            <ShoppingBag className="h-4 w-4 text-green-600" />
            <span className="font-medium">Shopify</span>
            <span className="text-muted-foreground">ProductVariant</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
            <Database className="h-4 w-4 text-blue-600" />
            <span className="font-medium">Stage 1</span>
            <span className="text-muted-foreground">RawSkusFromShopify</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
            <Database className="h-4 w-4 text-purple-600" />
            <span className="font-medium">Stage 2</span>
            <span className="text-muted-foreground">Sku</span>
          </div>
        </div>
      </div>

      {/* Shopify Fields Fetched */}
      <div className="mb-8 rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">GraphQL Fields Fetched</h2>
          <p className="text-sm text-muted-foreground mt-1">
            These fields are fetched from Shopify via bulk operation query
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {SHOPIFY_FIELDS_FETCHED.map((f, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{f.field}</code>
                <span className="text-muted-foreground text-xs">{f.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stage 1 Mappings */}
      <div className="mb-8 rounded-lg border border-blue-200 bg-card">
        <div className="p-4 border-b border-blue-200 bg-blue-50">
          <h2 className="font-semibold text-blue-900">Stage 1: Raw Ingestion</h2>
          <p className="text-sm text-blue-700 mt-1">
            Shopify → RawSkusFromShopify (stores data exactly as received)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-3 font-medium">Shopify Field</th>
                <th className="text-left p-3 font-medium w-8">→</th>
                <th className="text-left p-3 font-medium">Database Column</th>
                <th className="text-left p-3 font-medium">Transform</th>
              </tr>
            </thead>
            <tbody>
              {STAGE1_MAPPINGS.map((m, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <code className="text-xs bg-green-50 text-green-800 px-1.5 py-0.5 rounded">{m.source}</code>
                  </td>
                  <td className="p-3 text-muted-foreground">→</td>
                  <td className="p-3">
                    <code className="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded">{m.target}</code>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{m.transform}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stage 2 Mappings */}
      <div className="mb-8 rounded-lg border border-purple-200 bg-card">
        <div className="p-4 border-b border-purple-200 bg-purple-50">
          <h2 className="font-semibold text-purple-900">Stage 2: Transform to Sku</h2>
          <p className="text-sm text-purple-700 mt-1">
            RawSkusFromShopify → Sku (applies business logic and collection mapping)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-3 font-medium">Source</th>
                <th className="text-left p-3 font-medium w-8">→</th>
                <th className="text-left p-3 font-medium">Sku Column</th>
                <th className="text-left p-3 font-medium">Transform</th>
              </tr>
            </thead>
            <tbody>
              {STAGE2_MAPPINGS.map((m, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <code className="text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded">{m.source}</code>
                  </td>
                  <td className="p-3 text-muted-foreground">→</td>
                  <td className="p-3">
                    <code className="text-xs bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded">{m.target}</code>
                  </td>
                  <td className="p-3 text-xs">
                    {m.transform.startsWith('⚡') ? (
                      <span className="text-amber-700 font-medium">{m.transform}</span>
                    ) : (
                      <span className="text-muted-foreground">{m.transform}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-8 rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Filters Applied</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Records must pass these filters to be included in the Sku table
          </p>
        </div>
        <div className="p-4 space-y-2">
          {TRANSFORM_FILTERS.map((f, i) => (
            <div key={i} className="flex items-start gap-3 py-2">
              <code className="text-xs bg-red-50 text-red-800 px-2 py-1 rounded shrink-0">{f.filter}</code>
              <span className="text-sm text-muted-foreground">{f.reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">This mapping is hardcoded</p>
            <p>
              The sync pipeline is defined in code and has been refined over months of production use.
              To modify the fields fetched or transformation logic, edit{' '}
              <code className="bg-amber-100 px-1 rounded">src/lib/shopify/sync.ts</code>.
            </p>
            <p className="mt-2">
              <strong>Configurable parts:</strong>{' '}
              <Link href="/admin/shopify/config" className="underline">
                Product status filters
              </Link>{' '}
              and{' '}
              <Link href="/admin/collections" className="underline">
                Collection mappings
              </Link>{' '}
              can be configured through the admin UI.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
