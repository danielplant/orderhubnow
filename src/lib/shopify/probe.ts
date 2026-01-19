/**
 * Shopify API Access Probe
 *
 * Utilities for testing field accessibility by querying Shopify's GraphQL API.
 * Used by Developer Tools to discover which fields the current API token can access.
 */

import { prisma } from '@/lib/prisma'

// ============================================================================
// Types
// ============================================================================

export type AccessStatus = 'accessible' | 'restricted' | 'untested'

export interface ProbeResult {
  fieldPath: string
  accessStatus: AccessStatus
  errorMessage?: string
}

export interface ProbeBatchResult {
  results: ProbeResult[]
  probeTimestamp: string
}

// ============================================================================
// GraphQL Client
// ============================================================================

async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data?: T; error?: string }> {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

  if (!storeDomain || !accessToken) {
    return { error: 'Missing Shopify credentials' }
  }

  const endpoint = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const json = await response.json()

    if (json.errors?.length) {
      // Check for access denied errors
      const accessError = json.errors.find(
        (e: { message: string }) =>
          e.message.includes('access') ||
          e.message.includes('permission') ||
          e.message.includes('scope')
      )
      if (accessError) {
        return { error: accessError.message }
      }
      return { error: json.errors[0].message }
    }

    return { data: json.data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ============================================================================
// Probe Query Builders
// ============================================================================

/**
 * Build a minimal GraphQL query to test field access
 */
function buildProbeQuery(
  entityType: string,
  fieldPath: string,
  fieldKind: string
): string {
  // Determine the root query based on entity type
  const rootQuery = getEntityRootQuery(entityType)

  // Build field selection based on kind
  let fieldSelection: string

  switch (fieldKind) {
    case 'SCALAR':
    case 'ENUM':
      fieldSelection = fieldPath
      break
    case 'OBJECT':
      // For objects, request __typename to verify access
      fieldSelection = `${fieldPath} { __typename }`
      break
    case 'CONNECTION':
      // For connections, request minimal structure
      fieldSelection = `${fieldPath}(first: 1) { edges { node { id } } }`
      break
    case 'INTERFACE':
    case 'UNION':
      // For polymorphic types, use __typename
      fieldSelection = `${fieldPath} { __typename }`
      break
    default:
      fieldSelection = fieldPath
  }

  return `
    query ProbeField {
      ${rootQuery} {
        ${fieldSelection}
      }
    }
  `
}

/**
 * Get the root query path for an entity type
 */
function getEntityRootQuery(entityType: string): string {
  switch (entityType) {
    case 'Product':
      return 'products(first: 1) { edges { node'
    case 'ProductVariant':
      return 'productVariants(first: 1) { edges { node'
    case 'Collection':
      return 'collections(first: 1) { edges { node'
    case 'Order':
      return 'orders(first: 1) { edges { node'
    case 'Customer':
      return 'customers(first: 1) { edges { node'
    case 'InventoryItem':
      return 'inventoryItems(first: 1) { edges { node'
    default:
      throw new Error(`Unknown entity type: ${entityType}`)
  }
}

/**
 * Get the closing braces for the root query
 */
function getEntityRootClose(entityType: string): string {
  // All current entity types use connection queries
  return '} } }'
}

// ============================================================================
// Probe Execution
// ============================================================================

/**
 * Probe a single field for access
 */
export async function probeField(
  entityType: string,
  fieldPath: string,
  fieldKind: string
): Promise<ProbeResult> {
  try {
    const rootQuery = getEntityRootQuery(entityType)
    const rootClose = getEntityRootClose(entityType)

    // Build field selection based on kind
    let fieldSelection: string
    switch (fieldKind) {
      case 'SCALAR':
      case 'ENUM':
        fieldSelection = fieldPath
        break
      case 'OBJECT':
        fieldSelection = `${fieldPath} { __typename }`
        break
      case 'CONNECTION':
        fieldSelection = `${fieldPath}(first: 0) { edges { node { id } } }`
        break
      default:
        fieldSelection = `${fieldPath} { __typename }`
    }

    const query = `
      query ProbeField {
        ${rootQuery}
          ${fieldSelection}
        ${rootClose}
      }
    `

    const { error } = await shopifyGraphQL(query)

    if (error) {
      // Check if it's an access/permission error
      if (
        error.toLowerCase().includes('access') ||
        error.toLowerCase().includes('permission') ||
        error.toLowerCase().includes('scope') ||
        error.toLowerCase().includes('denied')
      ) {
        return {
          fieldPath,
          accessStatus: 'restricted',
          errorMessage: error,
        }
      }

      // Other errors might indicate field doesn't exist or query syntax
      return {
        fieldPath,
        accessStatus: 'restricted',
        errorMessage: error,
      }
    }

    return {
      fieldPath,
      accessStatus: 'accessible',
    }
  } catch (err) {
    return {
      fieldPath,
      accessStatus: 'restricted',
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Probe multiple fields in batches with rate limiting
 */
export async function probeFields(
  entityType: string,
  fields: Array<{ fieldPath: string; fieldKind: string }>,
  options?: {
    batchSize?: number
    delayMs?: number
    onProgress?: (current: number, total: number) => void
  }
): Promise<ProbeBatchResult> {
  const batchSize = options?.batchSize ?? 10
  const delayMs = options?.delayMs ?? 100
  const results: ProbeResult[] = []

  let processed = 0
  const total = fields.length

  // Process in batches
  for (let i = 0; i < fields.length; i += batchSize) {
    const batch = fields.slice(i, i + batchSize)

    // Probe all fields in batch concurrently
    const batchResults = await Promise.all(
      batch.map((f) => probeField(entityType, f.fieldPath, f.fieldKind))
    )

    results.push(...batchResults)
    processed += batch.length

    // Report progress
    if (options?.onProgress) {
      options.onProgress(processed, total)
    }

    // Rate limit between batches
    if (i + batchSize < fields.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return {
    results,
    probeTimestamp: new Date().toISOString(),
  }
}

/**
 * Update field access status in database
 */
export async function updateFieldAccessStatus(
  entityType: string,
  results: ProbeResult[]
): Promise<void> {
  for (const result of results) {
    await prisma.syncFieldConfig.updateMany({
      where: {
        entityType,
        fieldPath: result.fieldPath,
      },
      data: {
        accessStatus: result.accessStatus,
        updatedAt: new Date(),
      },
    })
  }
}
