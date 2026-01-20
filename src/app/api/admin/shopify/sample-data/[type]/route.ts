/**
 * GET /api/admin/shopify/sample-data/[type]
 *
 * Fetches sample data from Shopify using currently enabled fields.
 * Used to preview what data the sync will return.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getKnownEntities } from '@/lib/shopify/introspect'

interface RouteParams {
  params: Promise<{ type: string }>
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
      return { error: json.errors.map((e: { message: string }) => e.message).join(', ') }
    }

    return { data: json.data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ============================================================================
// Query Builder
// ============================================================================

interface FieldConfig {
  fieldPath: string
  fieldType: string
  category: string | null
}

/**
 * Build a GraphQL query for fetching sample data
 */
function buildSampleQuery(
  entityType: string,
  fields: FieldConfig[],
  count: number
): string {
  const rootQuery = getEntityRootQuery(entityType, count)

  // Build field selections
  const selections = fields
    .map((f) => buildFieldSelection(f))
    .filter(Boolean)
    .join('\n          ')

  return `
    query SampleData {
      ${rootQuery} {
        edges {
          node {
            ${selections}
          }
        }
      }
    }
  `
}

function getEntityRootQuery(entityType: string, count: number): string {
  switch (entityType) {
    case 'Product':
      return `products(first: ${count})`
    case 'ProductVariant':
      return `productVariants(first: ${count})`
    case 'Collection':
      return `collections(first: ${count})`
    case 'Order':
      return `orders(first: ${count})`
    case 'Customer':
      return `customers(first: ${count})`
    case 'InventoryItem':
      return `inventoryItems(first: ${count})`
    default:
      throw new Error(`Unknown entity type: ${entityType}`)
  }
}

function buildFieldSelection(field: FieldConfig): string | null {
  const { fieldPath, fieldType, category } = field

  // Skip complex types for sample data (connections, polymorphic, contextual)
  if (['connection', 'polymorphic', 'contextual', 'computed'].includes(category || '')) {
    return null
  }

  // Handle count category - these are Count objects, not scalars
  if (category === 'count') {
    return `${fieldPath} { count }`
  }

  // For object types, we need subfield selection
  if (category === 'object') {
    // Handle common object types with known subfields
    switch (fieldType) {
      case 'SEO':
        return `${fieldPath} { title description }`
      case 'TaxonomyCategory':
        return `${fieldPath} { name fullName }`
      case 'ProductPriceRangeV2':
        return `${fieldPath} { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }`
      case 'MoneyV2':
        return `${fieldPath} { amount currencyCode }`
      case 'Count':
        return `${fieldPath} { count }`
      case 'ProductCategory':
        return `${fieldPath} { productTaxonomyNode { name } }`
      case 'Image':
        return `${fieldPath} { url altText }`
      default:
        // For unknown object types, request __typename
        return `${fieldPath} { __typename }`
    }
  }

  // Scalar, enum, timestamp, count fields
  return fieldPath
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type } = await params
  const { searchParams } = new URL(request.url)
  const count = Math.min(Math.max(parseInt(searchParams.get('count') || '3'), 1), 10)

  // Validate entity type
  const knownEntities = getKnownEntities()
  if (!knownEntities.some((e) => e.name === type)) {
    return NextResponse.json({ error: `Unknown entity type: ${type}` }, { status: 400 })
  }

  try {
    // Get enabled fields
    const enabledFields = await prisma.syncFieldConfig.findMany({
      where: {
        entityType: type,
        enabled: true,
      },
      select: {
        fieldPath: true,
        fieldType: true,
        category: true,
      },
    })

    if (enabledFields.length === 0) {
      return NextResponse.json({
        success: true,
        entityType: type,
        samples: [],
        message: 'No fields enabled. Enable fields to see sample data.',
        fetchedAt: new Date().toISOString(),
      })
    }

    // Build and execute query
    const query = buildSampleQuery(type, enabledFields, count)
    const { data, error } = await shopifyGraphQL<Record<string, { edges: Array<{ node: unknown }> }>>(query)

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    // Extract samples from response
    const rootKey = Object.keys(data || {})[0]
    const samples = data?.[rootKey]?.edges?.map((e) => e.node) || []

    return NextResponse.json({
      success: true,
      entityType: type,
      samples,
      sampleCount: samples.length,
      enabledFieldCount: enabledFields.length,
      fetchedAt: new Date().toISOString(),
      query: process.env.NODE_ENV === 'development' ? query : undefined,
    })
  } catch (error) {
    console.error(`Error fetching sample data for ${type}:`, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
