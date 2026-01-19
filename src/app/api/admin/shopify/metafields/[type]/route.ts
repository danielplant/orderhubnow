/**
 * GET /api/admin/shopify/metafields/[type]
 *
 * Discovers metafield definitions for an entity type from Shopify.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getKnownEntities } from '@/lib/shopify/introspect'

interface RouteParams {
  params: Promise<{ type: string }>
}

// ============================================================================
// Types
// ============================================================================

interface MetafieldDefinition {
  namespace: string
  key: string
  type: string
  description?: string
}

interface MetafieldNode {
  namespace: string
  key: string
  type: { name: string }
  description?: string
}

interface MetafieldDefinitionsResponse {
  metafieldDefinitions: {
    edges: Array<{
      node: MetafieldNode
    }>
  }
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
// Metafield Owner Type Mapping
// ============================================================================

function getMetafieldOwnerType(entityType: string): string {
  switch (entityType) {
    case 'Product':
      return 'PRODUCT'
    case 'ProductVariant':
      return 'PRODUCTVARIANT'
    case 'Collection':
      return 'COLLECTION'
    case 'Order':
      return 'ORDER'
    case 'Customer':
      return 'CUSTOMER'
    default:
      throw new Error(`No metafield owner type for entity: ${entityType}`)
  }
}

// ============================================================================
// GraphQL Query
// ============================================================================

const METAFIELD_DEFINITIONS_QUERY = `
  query MetafieldDefinitions($ownerType: MetafieldOwnerType!) {
    metafieldDefinitions(ownerType: $ownerType, first: 100) {
      edges {
        node {
          namespace
          key
          type { name }
          description
        }
      }
    }
  }
`

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type } = await params

  // Validate entity type
  const knownEntities = getKnownEntities()
  const entity = knownEntities.find((e) => e.name === type)
  if (!entity) {
    return NextResponse.json({ error: `Unknown entity type: ${type}` }, { status: 400 })
  }

  if (!entity.hasMetafields) {
    return NextResponse.json({
      success: true,
      entityType: type,
      definitions: [],
      message: `${type} does not support metafields`,
    })
  }

  try {
    const ownerType = getMetafieldOwnerType(type)

    const { data, error } = await shopifyGraphQL<MetafieldDefinitionsResponse>(
      METAFIELD_DEFINITIONS_QUERY,
      { ownerType }
    )

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    const definitions: MetafieldDefinition[] =
      data?.metafieldDefinitions?.edges?.map(({ node }) => ({
        namespace: node.namespace,
        key: node.key,
        type: node.type.name,
        description: node.description || undefined,
      })) || []

    // Group by namespace for UI
    const byNamespace = definitions.reduce(
      (acc, def) => {
        if (!acc[def.namespace]) {
          acc[def.namespace] = []
        }
        acc[def.namespace].push(def)
        return acc
      },
      {} as Record<string, MetafieldDefinition[]>
    )

    return NextResponse.json({
      success: true,
      entityType: type,
      definitions,
      byNamespace,
      totalCount: definitions.length,
    })
  } catch (error) {
    console.error(`Error fetching metafield definitions for ${type}:`, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
