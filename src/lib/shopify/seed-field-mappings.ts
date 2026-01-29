/**
 * Seed ShopifyFieldMapping table with fields from the current BULK_OPERATION_QUERY.
 * This creates a baseline configuration that matches the existing sync behavior.
 *
 * Phase 1 Enhancement: Includes complete metadata for query generation:
 * - fieldType: scalar, connection, metafield, object
 * - sortOrder: Exact order in hardcoded query
 * - metafieldNamespace/metafieldKey: For metafield accessors
 * - paginationLimit: For connection pagination
 * - queryArguments: For fields with arguments
 */

import { prisma } from '@/lib/prisma'
import { BULK_OPERATION_QUERY } from './sync'

// ============================================================================
// Field definitions from BULK_OPERATION_QUERY (sync.ts lines 138-184)
// ============================================================================

interface FieldDefinition {
  // Existing fields
  fieldPath: string
  depth: number
  isProtected: boolean

  // NEW fields for query generation
  fieldType: 'scalar' | 'connection' | 'metafield' | 'object'
  sortOrder: number
  metafieldNamespace?: string // Only for fieldType: 'metafield'
  metafieldKey?: string // Only for fieldType: 'metafield'
  paginationLimit?: number // Only for fieldType: 'connection'
  queryArguments?: string // JSON, for fields with arguments
}

/**
 * All fields currently fetched by BULK_OPERATION_QUERY.
 * These represent the "known-good" baseline configuration.
 *
 * IMPORTANT: sortOrder must match the exact order in the hardcoded query
 * for the query generator to produce identical output.
 */
const BULK_QUERY_FIELDS: FieldDefinition[] = [
  // === ProductVariant direct scalars (sortOrder 1-6) ===
  { fieldPath: 'id', depth: 1, isProtected: true, fieldType: 'scalar', sortOrder: 1 },
  { fieldPath: 'sku', depth: 1, isProtected: true, fieldType: 'scalar', sortOrder: 2 },
  { fieldPath: 'price', depth: 1, isProtected: true, fieldType: 'scalar', sortOrder: 3 },
  { fieldPath: 'inventoryQuantity', depth: 1, isProtected: false, fieldType: 'scalar', sortOrder: 4 },
  { fieldPath: 'displayName', depth: 1, isProtected: false, fieldType: 'scalar', sortOrder: 5 },
  { fieldPath: 'title', depth: 1, isProtected: false, fieldType: 'scalar', sortOrder: 6 },

  // === Image (sortOrder 7) ===
  { fieldPath: 'image.url', depth: 2, isProtected: false, fieldType: 'scalar', sortOrder: 7 },

  // === Selected options - OBJECT type (sortOrder 8-9) ===
  { fieldPath: 'selectedOptions.name', depth: 2, isProtected: false, fieldType: 'object', sortOrder: 8 },
  { fieldPath: 'selectedOptions.value', depth: 2, isProtected: false, fieldType: 'object', sortOrder: 9 },

  // === Product scalars (sortOrder 10-13) ===
  { fieldPath: 'product.id', depth: 2, isProtected: false, fieldType: 'scalar', sortOrder: 10 },
  { fieldPath: 'product.title', depth: 2, isProtected: false, fieldType: 'scalar', sortOrder: 11 },
  { fieldPath: 'product.status', depth: 2, isProtected: false, fieldType: 'scalar', sortOrder: 12 },
  { fieldPath: 'product.productType', depth: 2, isProtected: false, fieldType: 'scalar', sortOrder: 13 },

  // === Product images (sortOrder 14-15) ===
  {
    fieldPath: 'product.featuredMedia.preview.image.url',
    depth: 4,
    isProtected: false,
    fieldType: 'scalar',
    sortOrder: 14,
  },
  {
    fieldPath: 'product.images.edges.node.url',
    depth: 4,
    isProtected: false,
    fieldType: 'connection',
    sortOrder: 15,
    paginationLimit: 1,
  },

  // === Product metafields (sortOrder 16-25) ===
  {
    fieldPath: 'product.mfOrderEntryCollection.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 16,
    metafieldNamespace: 'custom',
    metafieldKey: 'order_entry_collection',
  },
  {
    fieldPath: 'product.mfOrderEntryDescription.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 17,
    metafieldNamespace: 'custom',
    metafieldKey: 'label_title',
  },
  {
    fieldPath: 'product.mfFabric.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 18,
    metafieldNamespace: 'custom',
    metafieldKey: 'fabric',
  },
  {
    fieldPath: 'product.mfColor.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 19,
    metafieldNamespace: 'custom',
    metafieldKey: 'color',
  },
  {
    fieldPath: 'product.mfFeatures.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 20,
    metafieldNamespace: 'custom',
    metafieldKey: 'features',
  },
  {
    fieldPath: 'product.mfMSRP.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 21,
    metafieldNamespace: 'custom',
    metafieldKey: 'msrp',
  },
  {
    fieldPath: 'product.mfCADWSPrice.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 22,
    metafieldNamespace: 'custom',
    metafieldKey: 'test_number_',
  },
  {
    fieldPath: 'product.mfUSDWSPrice.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 23,
    metafieldNamespace: 'custom',
    metafieldKey: 'us_ws_price',
  },
  {
    fieldPath: 'product.mfMSRPCAD.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 24,
    metafieldNamespace: 'custom',
    metafieldKey: 'msrp_cad',
  },
  {
    fieldPath: 'product.mfMSRPUSD.value',
    depth: 3,
    isProtected: false,
    fieldType: 'metafield',
    sortOrder: 25,
    metafieldNamespace: 'custom',
    metafieldKey: 'msrp_us',
  },

  // === InventoryItem (sortOrder 26-28) ===
  { fieldPath: 'inventoryItem.id', depth: 2, isProtected: false, fieldType: 'scalar', sortOrder: 26 },
  {
    fieldPath: 'inventoryItem.measurement.weight.unit',
    depth: 4,
    isProtected: false,
    fieldType: 'scalar',
    sortOrder: 27,
  },
  {
    fieldPath: 'inventoryItem.measurement.weight.value',
    depth: 4,
    isProtected: false,
    fieldType: 'scalar',
    sortOrder: 28,
  },

  // === Inventory levels (sortOrder 29-31) ===
  {
    fieldPath: 'inventoryItem.inventoryLevels.edges.node.id',
    depth: 5,
    isProtected: false,
    fieldType: 'connection',
    sortOrder: 29,
    paginationLimit: 10,
  },
  {
    fieldPath: 'inventoryItem.inventoryLevels.edges.node.quantities.name',
    depth: 6,
    isProtected: false,
    fieldType: 'scalar',
    sortOrder: 30,
    queryArguments: '{"names":["incoming","committed"]}',
  },
  {
    fieldPath: 'inventoryItem.inventoryLevels.edges.node.quantities.quantity',
    depth: 6,
    isProtected: false,
    fieldType: 'scalar',
    sortOrder: 31,
  },
]

// ============================================================================
// Pre-flight Validation
// ============================================================================

/**
 * Validates that BULK_QUERY_FIELDS has correct metadata for query generation.
 * Run this before seeding to catch configuration errors early.
 *
 * Performs both structural AND semantic validation:
 * - Structural: Fields have required properties (namespace, key, paginationLimit)
 * - Semantic: Metafield keys actually exist in BULK_OPERATION_QUERY
 */
export function validateSeedAgainstQuery(): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  // ─────────────────────────────────────────────────────────────
  // SEMANTIC VALIDATION: Parse actual metafield keys from query
  // ─────────────────────────────────────────────────────────────
  const metafieldRegex = /metafield\(namespace:\s*"([^"]+)",\s*key:\s*"([^"]+)"\)/g
  const queryMetafields = new Set<string>()
  let match
  while ((match = metafieldRegex.exec(BULK_OPERATION_QUERY)) !== null) {
    queryMetafields.add(`${match[1]}:${match[2]}`) // e.g., "custom:fabric"
  }

  // ─────────────────────────────────────────────────────────────
  // STRUCTURAL CHECK: All metafields have namespace/key
  // ─────────────────────────────────────────────────────────────
  const metafields = BULK_QUERY_FIELDS.filter((f) => f.fieldType === 'metafield')
  for (const mf of metafields) {
    if (!mf.metafieldNamespace || !mf.metafieldKey) {
      issues.push(`Metafield ${mf.fieldPath} missing namespace/key`)
      continue // Skip semantic check if structural check fails
    }

    // SEMANTIC CHECK: metafield key exists in the hardcoded query
    const key = `${mf.metafieldNamespace}:${mf.metafieldKey}`
    if (!queryMetafields.has(key)) {
      issues.push(
        `Metafield ${mf.fieldPath} has key '${mf.metafieldKey}' not found in BULK_OPERATION_QUERY`
      )
    }
  }

  // Check for metafields in query but NOT in seed (orphaned)
  const seedMetafieldKeys = new Set(
    metafields
      .filter((mf) => mf.metafieldNamespace && mf.metafieldKey)
      .map((mf) => `${mf.metafieldNamespace}:${mf.metafieldKey}`)
  )
  for (const queryKey of queryMetafields) {
    if (!seedMetafieldKeys.has(queryKey)) {
      issues.push(`Query has metafield '${queryKey}' not present in seed data`)
    }
  }

  // Check: Connections have paginationLimit
  const connections = BULK_QUERY_FIELDS.filter((f) => f.fieldType === 'connection')
  for (const conn of connections) {
    if (!conn.paginationLimit) {
      issues.push(`Connection ${conn.fieldPath} missing paginationLimit`)
    }
  }

  // Check: sortOrder is unique and sequential
  const sortOrders = BULK_QUERY_FIELDS.map((f) => f.sortOrder)
  const uniqueSorts = new Set(sortOrders)
  if (uniqueSorts.size !== BULK_QUERY_FIELDS.length) {
    issues.push('Duplicate sortOrder values detected')
  }

  // Check: sortOrder is sequential (1, 2, 3, ...)
  const sortedOrders = [...sortOrders].sort((a, b) => a - b)
  for (let i = 0; i < sortedOrders.length; i++) {
    if (sortedOrders[i] !== i + 1) {
      issues.push(`sortOrder gap: expected ${i + 1}, found ${sortedOrders[i]}`)
      break
    }
  }

  // Check: Expected count (31 fields now including quantities.quantity)
  if (BULK_QUERY_FIELDS.length !== 31) {
    issues.push(`Expected 31 fields, found ${BULK_QUERY_FIELDS.length}`)
  }

  return { valid: issues.length === 0, issues }
}

// ============================================================================
// Seed Function
// ============================================================================

export interface SeedResult {
  created: number
  updated: number
  skipped: number
  total: number
  fields: string[]
}

/**
 * Seeds the ShopifyFieldMapping table with all fields from BULK_OPERATION_QUERY.
 * - Creates new mappings if they don't exist
 * - Updates existing mappings with new query generation metadata
 *
 * @param connectionId - The connection/tenant ID (default: "default")
 * @returns Count of created, updated, and skipped mappings
 */
export async function seedFieldMappingsFromBulkQuery(connectionId: string = 'default'): Promise<SeedResult> {
  // PRE-FLIGHT VALIDATION
  const validation = validateSeedAgainstQuery()
  if (!validation.valid) {
    console.error('[SeedFieldMappings] Pre-flight validation failed:', validation.issues)
    throw new Error(`Seed validation failed: ${validation.issues.join(', ')}`)
  }

  const entityType = 'ProductVariant'
  let created = 0
  let updated = 0
  let skipped = 0
  const createdFields: string[] = []

  for (const field of BULK_QUERY_FIELDS) {
    const fullPath = `${entityType}.${field.fieldPath}`

    // Check if mapping already exists
    const existing = await prisma.shopifyFieldMapping.findUnique({
      where: {
        connectionId_entityType_fieldPath: {
          connectionId,
          entityType,
          fieldPath: field.fieldPath,
        },
      },
    })

    if (existing) {
      // UPDATE existing record with new query generation columns
      const needsUpdate =
        existing.serviceName !== 'bulk_sync' ||
        existing.fieldType !== field.fieldType ||
        existing.sortOrder !== field.sortOrder ||
        existing.metafieldNamespace !== (field.metafieldNamespace ?? null) ||
        existing.metafieldKey !== (field.metafieldKey ?? null) ||
        existing.paginationLimit !== (field.paginationLimit ?? null) ||
        existing.queryArguments !== (field.queryArguments ?? null)

      if (needsUpdate) {
        await prisma.shopifyFieldMapping.update({
          where: { id: existing.id },
          data: {
            serviceName: 'bulk_sync',
            fieldType: field.fieldType,
            sortOrder: field.sortOrder,
            metafieldNamespace: field.metafieldNamespace ?? null,
            metafieldKey: field.metafieldKey ?? null,
            paginationLimit: field.paginationLimit ?? null,
            queryArguments: field.queryArguments ?? null,
          },
        })
        updated++
      } else {
        skipped++
      }
      continue
    }

    // CREATE new mapping
    await prisma.shopifyFieldMapping.create({
      data: {
        connectionId,
        entityType,
        fieldPath: field.fieldPath,
        fullPath,
        depth: field.depth,
        enabled: true, // All fields in current query are enabled
        isProtected: field.isProtected,
        accessStatus: 'accessible', // Known to work in current sync
        transformType: 'direct',
        targetTable: null,
        targetColumn: null,
        transformConfig: null,
        // NEW columns
        serviceName: 'bulk_sync',
        fieldType: field.fieldType,
        sortOrder: field.sortOrder,
        metafieldNamespace: field.metafieldNamespace ?? null,
        metafieldKey: field.metafieldKey ?? null,
        paginationLimit: field.paginationLimit ?? null,
        queryArguments: field.queryArguments ?? null,
      },
    })

    created++
    createdFields.push(fullPath)
  }

  console.log(
    `[SeedFieldMappings] Created ${created}, updated ${updated}, skipped ${skipped} (total: ${BULK_QUERY_FIELDS.length})`
  )

  return {
    created,
    updated,
    skipped,
    total: BULK_QUERY_FIELDS.length,
    fields: createdFields,
  }
}

/**
 * Returns the list of fields that would be seeded (for dry-run preview).
 */
export function getFieldsToSeed(): Array<{
  fullPath: string
  depth: number
  isProtected: boolean
  fieldType: string
  sortOrder: number
}> {
  return BULK_QUERY_FIELDS.map((f) => ({
    fullPath: `ProductVariant.${f.fieldPath}`,
    depth: f.depth,
    isProtected: f.isProtected,
    fieldType: f.fieldType,
    sortOrder: f.sortOrder,
  }))
}

/**
 * Get the raw BULK_QUERY_FIELDS for external use (e.g., query generator).
 */
export function getBulkQueryFields(): FieldDefinition[] {
  return [...BULK_QUERY_FIELDS]
}
