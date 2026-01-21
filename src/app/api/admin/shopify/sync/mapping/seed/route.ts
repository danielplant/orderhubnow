/**
 * Seed Default Mapping API
 * ============================================================================
 * POST /api/admin/shopify/sync/mapping/seed
 * Creates the default ProductVariant → Sku mapping if it doesn't exist.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getMappingService } from '@/lib/sync-service/services/mapping-service'

export async function POST() {
  try {
    const session = await auth()
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/admin/shopify/sync/mapping/seed/route.ts:POST:auth',message:'Seed mapping auth check',data:{hasSession:!!session,hasUser:!!session?.user,role:session?.user?.role},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion agent log
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const mappingService = getMappingService()

    // Check if default mapping already exists
    const existingMappings = await mappingService.getBySourceResource('ProductVariant')
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/admin/shopify/sync/mapping/seed/route.ts:POST:existing',message:'Existing default mappings',data:{count:existingMappings?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
    // #endregion agent log
    if (existingMappings.length > 0) {
      return NextResponse.json({
        success: true,
        message: 'Default mapping already exists',
        mappingId: existingMappings[0].id,
        alreadyExists: true,
      })
    }

    // Create the default ProductVariant → Sku mapping
    const mappingId = await mappingService.create({
      name: 'Default Product Sync',
      description: 'Syncs Shopify ProductVariants to Sku table',
      sourceResource: 'ProductVariant',
      targetTable: 'Sku',
      keyMapping: {
        sourceField: 'sku',
        targetColumn: 'SkuID',
      },
      mappings: [
        // Core fields
        {
          id: 'shopify-id',
          source: { type: 'single', resource: 'ProductVariant', field: 'id' },
          target: { table: 'Sku', column: 'ShopifyId' },
          enabled: true,
        },
        {
          id: 'sku-id',
          source: { type: 'single', resource: 'ProductVariant', field: 'sku' },
          target: { table: 'Sku', column: 'SkuID' },
          enabled: true,
        },
        {
          id: 'title',
          source: { type: 'single', resource: 'ProductVariant', field: 'product.title' },
          target: { table: 'Sku', column: 'Description' },
          enabled: true,
        },
        {
          id: 'price',
          source: { type: 'single', resource: 'ProductVariant', field: 'price' },
          target: { table: 'Sku', column: 'PriceCAD' },
          enabled: true,
        },
        {
          id: 'compare-at-price',
          source: { type: 'single', resource: 'ProductVariant', field: 'compareAtPrice' },
          target: { table: 'Sku', column: 'CompareAtPriceCAD' },
          enabled: true,
        },
        {
          id: 'image-url',
          source: { type: 'single', resource: 'ProductVariant', field: 'image.url' },
          target: { table: 'Sku', column: 'ShopifyImageURL' },
          enabled: true,
        },
        {
          id: 'inventory',
          source: { type: 'single', resource: 'ProductVariant', field: 'inventoryQuantity' },
          target: { table: 'Sku', column: 'InventoryQuantity' },
          enabled: true,
        },
        {
          id: 'barcode',
          source: { type: 'single', resource: 'ProductVariant', field: 'barcode' },
          target: { table: 'Sku', column: 'Barcode' },
          enabled: true,
        },
        // Metafields
        {
          id: 'color',
          source: { type: 'single', resource: 'ProductVariant', field: 'metafield.custom.color' },
          target: { table: 'Sku', column: 'SkuColor' },
          enabled: true,
        },
        {
          id: 'size',
          source: { type: 'single', resource: 'ProductVariant', field: 'metafield.custom.size' },
          target: { table: 'Sku', column: 'SkuSize' },
          enabled: true,
        },
        {
          id: 'fabric',
          source: { type: 'single', resource: 'ProductVariant', field: 'metafield.custom.fabric_content' },
          target: { table: 'Sku', column: 'FabricContent' },
          enabled: true,
        },
        {
          id: 'units-per-case',
          source: { type: 'single', resource: 'ProductVariant', field: 'metafield.custom.units_per_case' },
          target: { table: 'Sku', column: 'UnitsPerCase' },
          enabled: true,
        },
      ],
      webhookEnabled: true,
      deleteStrategy: 'soft',
      filters: [
        {
          field: 'product.status',
          operator: 'eq',
          value: 'ACTIVE',
        },
      ],
    })
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/admin/shopify/sync/mapping/seed/route.ts:POST:created',message:'Default mapping created',data:{mappingId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion agent log

    console.log('[Seed] Created default ProductVariant → Sku mapping:', mappingId)

    return NextResponse.json({
      success: true,
      message: 'Default mapping created successfully',
      mappingId,
      alreadyExists: false,
    })
  } catch (error) {
    console.error('[Seed] Error creating default mapping:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
