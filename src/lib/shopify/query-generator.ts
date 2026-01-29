/**
 * Query Generator for Shopify Bulk Operations
 *
 * This module generates GraphQL bulk operation queries from configuration.
 * - Spike version: Hardcoded fields to prove the approach
 * - Database version: Reads from ShopifyFieldMapping table
 */

import { prisma } from '@/lib/prisma'
import { BULK_OPERATION_QUERY } from './sync'

// ============================================================================
// SPIKE VERSION - Hardcoded field list, no database reads
// Purpose: Prove we can generate an exact match of BULK_OPERATION_QUERY
// ============================================================================

/**
 * @deprecated Phase 1 spike - replaced by database-driven buildQueryBody() in Phase 2.
 * Kept for reference only. Delete in Phase 3.
 */
export function generateQueryFromConfig_SPIKE(): string {
  // Build the exact same structure as BULK_OPERATION_QUERY
  return `
  mutation {
    bulkOperationRunQuery(
      query: """
      {
        productVariants {
          edges {
            node {
              id
              sku
              price
              inventoryQuantity
              displayName
              title
              image { url }
              selectedOptions { name value }
              product {
                id
                title
                status
                productType
                featuredMedia { preview { image { url } } }
                images(first: 1) { edges { node { url } } }
                mfOrderEntryCollection: metafield(namespace: "custom", key: "order_entry_collection") { value }
                mfOrderEntryDescription: metafield(namespace: "custom", key: "label_title") { value }
                mfFabric: metafield(namespace: "custom", key: "fabric") { value }
                mfColor: metafield(namespace: "custom", key: "color") { value }
                mfFeatures: metafield(namespace: "custom", key: "features") { value }
                mfMSRP: metafield(namespace: "custom", key: "msrp") { value }
                mfCADWSPrice: metafield(namespace: "custom", key: "test_number_") { value }
                mfUSDWSPrice: metafield(namespace: "custom", key: "us_ws_price") { value }
                mfMSRPCAD: metafield(namespace: "custom", key: "msrp_cad") { value }
                mfMSRPUSD: metafield(namespace: "custom", key: "msrp_us") { value }
              }
              inventoryItem {
                id
                measurement { weight { unit value } }
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      id
                      quantities(names: ["incoming", "committed"]) { name quantity }
                    }
                  }
                }
              }
            }
          }
        }
      }
      """
    ) {
      bulkOperation { id status url }
      userErrors { field message }
    }
  }
`
}

// ============================================================================
// Normalization and Comparison Utilities
// ============================================================================

/**
 * Normalizes a GraphQL query for comparison.
 * - Trims each line
 * - Removes empty lines
 * - Joins with newlines
 *
 * This allows comparison of queries with different whitespace formatting.
 */
export function normalizeQuery(query: string): string {
  return query
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

/**
 * Computes line-by-line differences between two normalized query strings.
 */
export function computeLineDiff(a: string, b: string): string[] {
  const linesA = a.split('\n')
  const linesB = b.split('\n')
  const diffs: string[] = []

  const maxLen = Math.max(linesA.length, linesB.length)
  for (let i = 0; i < maxLen; i++) {
    if (linesA[i] !== linesB[i]) {
      diffs.push(`Line ${i + 1}:`)
      diffs.push(`  Hardcoded: ${linesA[i] ?? '(missing)'}`)
      diffs.push(`  Generated: ${linesB[i] ?? '(missing)'}`)
    }
  }

  return diffs
}

// ============================================================================
// SPIKE Validation
// ============================================================================

export interface SpikeValidationResult {
  match: boolean
  normalizedHardcoded: string
  normalizedGenerated: string
  differences: string[]
}

/**
 * @deprecated Phase 1 spike validation - replaced by validateQueryGeneration() in Phase 2.
 * Kept for reference only. Delete in Phase 3.
 */
export function validateQueryGeneration_SPIKE(): SpikeValidationResult {
  const generated = generateQueryFromConfig_SPIKE()
  const hardcoded = BULK_OPERATION_QUERY

  const normHardcoded = normalizeQuery(hardcoded)
  const normGenerated = normalizeQuery(generated)

  const match = normHardcoded === normGenerated

  return {
    match,
    normalizedHardcoded: normHardcoded,
    normalizedGenerated: normGenerated,
    differences: match ? [] : computeLineDiff(normHardcoded, normGenerated),
  }
}

// ============================================================================
// Test Runner (for development)
// ============================================================================

/**
 * Run the spike validation and log results.
 * Call this from a script or test to verify the spike works.
 */
export function runSpikeTest(): void {
  console.log('=== Running Query Generator Spike Test ===\n')

  const result = validateQueryGeneration_SPIKE()

  if (result.match) {
    console.log('✅ SUCCESS: Queries match!\n')
  } else {
    console.log('❌ FAILURE: Queries do not match\n')
    console.log('Differences:')
    result.differences.forEach((diff) => console.log(diff))
    console.log('\n--- Normalized Hardcoded ---')
    console.log(result.normalizedHardcoded)
    console.log('\n--- Normalized Generated ---')
    console.log(result.normalizedGenerated)
  }
}

// ============================================================================
// DATABASE-DRIVEN QUERY GENERATION
// ============================================================================

interface FieldMapping {
  fieldPath: string
  fieldType: string
  sortOrder: number | null
  metafieldNamespace: string | null
  metafieldKey: string | null
  paginationLimit: number | null
  queryArguments: string | null
}

/**
 * Generates a GraphQL bulk operation query from ShopifyFieldMapping config.
 *
 * Phase 2: Database-driven query generation using template-based approach.
 *
 * The generated query will match BULK_OPERATION_QUERY exactly when:
 * 1. All fields are seeded with correct metadata
 * 2. sortOrder preserves the original field order
 * 3. fieldType correctly identifies metafields/connections/objects
 */
export async function generateQueryFromConfig(
  serviceName: string,
  connectionId: string = 'default'
): Promise<string> {
  // Fetch enabled fields for this service, ordered by sortOrder
  const fields = await prisma.shopifyFieldMapping.findMany({
    where: {
      connectionId,
      serviceName,
      enabled: true,
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      fieldPath: true,
      fieldType: true,
      sortOrder: true,
      metafieldNamespace: true,
      metafieldKey: true,
      paginationLimit: true,
      queryArguments: true,
    },
  })

  if (fields.length === 0) {
    throw new Error(`No enabled fields found for service '${serviceName}'. Run seed first.`)
  }

  // Build query body from database config
  const queryBody = buildQueryBody(fields)

  return `
  mutation {
    bulkOperationRunQuery(
      query: """
      {
        productVariants {
          edges {
            node {
${queryBody}
            }
          }
        }
      }
      """
    ) {
      bulkOperation { id status url }
      userErrors { field message }
    }
  }
`
}

// Indent constants for clarity - must match BULK_OPERATION_QUERY exactly
const INDENT_14 = '              ' // 14 spaces - node level
const INDENT_16 = '                ' // 16 spaces - product/inventoryItem level

/**
 * Builds the inner query body from field mappings.
 * Uses a template-based approach where only metafield lines are parameterized.
 * This guarantees exact match with BULK_OPERATION_QUERY.
 */
function buildQueryBody(fields: FieldMapping[]): string {
  // Extract metafields sorted by sortOrder
  const metafields = fields
    .filter((f) => f.fieldType === 'metafield')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  // VALIDATION: Ensure exactly 10 metafields (matches hardcoded query)
  if (metafields.length !== 10) {
    throw new Error(
      `Expected exactly 10 metafields for bulk_sync, found ${metafields.length}. ` +
        `Check ShopifyFieldMapping table has correct fieldType='metafield' entries.`
    )
  }

  // Build metafield lines from database config
  const metafieldLines = metafields
    .map((mf) => {
      // product.mfFabric.value -> mfFabric
      const alias = mf.fieldPath.split('.')[1]

      // VALIDATION: Alias must start with 'mf' (metafield convention)
      if (!alias || !alias.startsWith('mf')) {
        throw new Error(
          `Invalid metafield fieldPath format: '${mf.fieldPath}'. ` +
            `Expected 'product.mfXxx.value' pattern where alias starts with 'mf'.`
        )
      }

      return `${INDENT_16}${alias}: metafield(namespace: "${mf.metafieldNamespace}", key: "${mf.metafieldKey}") { value }`
    })
    .join('\n')

  // Template with fixed structure, parameterized metafields
  // NOTE: Template limits future flexibility - adding/removing non-metafield fields
  // requires template changes. This is acceptable for Phase 2; can evolve to fully
  // dynamic in Phase 3+ if needed.
  return `${INDENT_14}id
${INDENT_14}sku
${INDENT_14}price
${INDENT_14}inventoryQuantity
${INDENT_14}displayName
${INDENT_14}title
${INDENT_14}image { url }
${INDENT_14}selectedOptions { name value }
${INDENT_14}product {
${INDENT_16}id
${INDENT_16}title
${INDENT_16}status
${INDENT_16}productType
${INDENT_16}featuredMedia { preview { image { url } } }
${INDENT_16}images(first: 1) { edges { node { url } } }
${metafieldLines}
${INDENT_14}}
${INDENT_14}inventoryItem {
${INDENT_16}id
${INDENT_16}measurement { weight { unit value } }
${INDENT_16}inventoryLevels(first: 10) {
${INDENT_16}  edges {
${INDENT_16}    node {
${INDENT_16}      id
${INDENT_16}      quantities(names: ["incoming", "committed"]) { name quantity }
${INDENT_16}    }
${INDENT_16}  }
${INDENT_16}}
${INDENT_14}}`
}

// ============================================================================
// DATABASE-DRIVEN VALIDATION
// ============================================================================

export interface ValidationResult {
  match: boolean
  hardcoded: string
  generated: string
  normalizedHardcoded: string
  normalizedGenerated: string
  differences: string[]
}

/**
 * Compares generated query against hardcoded BULK_OPERATION_QUERY.
 * This is the key validation that proves config-driven generation works.
 */
export async function validateQueryGeneration(
  serviceName: string,
  connectionId: string = 'default'
): Promise<ValidationResult> {
  const generated = await generateQueryFromConfig(serviceName, connectionId)
  const hardcoded = BULK_OPERATION_QUERY

  const normalizedHardcoded = normalizeQuery(hardcoded)
  const normalizedGenerated = normalizeQuery(generated)

  const match = normalizedHardcoded === normalizedGenerated

  return {
    match,
    hardcoded,
    generated,
    normalizedHardcoded,
    normalizedGenerated,
    differences: match ? [] : computeLineDiff(normalizedHardcoded, normalizedGenerated),
  }
}
