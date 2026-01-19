/**
 * Shopify GraphQL Schema Introspection
 *
 * Provides utilities for introspecting Shopify's GraphQL schema to discover
 * available fields, their types, and categorization for the Developer Tools UI.
 *
 * Adapted from: /ohn-repo/archive/2026-01-08/research/archive/03_testv2-myorderhub
 */

import { prisma } from '@/lib/prisma'

// ============================================================================
// Types
// ============================================================================

export interface IntrospectionField {
  name: string
  description?: string
  kind: string // SCALAR, OBJECT, ENUM, INTERFACE, UNION, CONNECTION
  baseType: string // The underlying type name (e.g., String, Product, ProductVariantConnection)
  category: FieldCategory
  reason: string // Explanation of why this category was assigned
  isDeprecated?: boolean
  deprecationReason?: string
  hasRequiredArgs?: boolean
  subfields?: string[] // For OBJECT types
  enumValues?: string[] // For ENUM types
}

export type FieldCategory =
  | 'system' // id, handle, legacyResourceId
  | 'timestamp' // createdAt, updatedAt, publishedAt
  | 'count' // variantsCount, mediaCount, etc.
  | 'scalar' // title, description, vendor, etc.
  | 'enum' // status, productType
  | 'object' // seo, category, compareAtPriceRange
  | 'connection' // variants, media, collections (paginated lists)
  | 'polymorphic' // Media, interfaces/unions needing fragments
  | 'contextual' // publishedInContext, inCollection (need args)
  | 'computed' // contextualPricing, restrictedForResource
  | 'metafield' // metafields and metafield definitions

export interface IntrospectionResult {
  entityType: string
  apiVersion: string
  fields: IntrospectionField[]
  cachedAt: string
  isStale: boolean
}

// GraphQL introspection response types
interface GraphQLTypeRef {
  kind: string
  name: string | null
  ofType?: GraphQLTypeRef | null
}

interface GraphQLArg {
  name: string
  defaultValue: string | null
  type: GraphQLTypeRef
}

interface GraphQLField {
  name: string
  description?: string
  args: GraphQLArg[]
  type: GraphQLTypeRef
  isDeprecated?: boolean
  deprecationReason?: string
}

interface GraphQLEnumValue {
  name: string
  description?: string
  isDeprecated?: boolean
}

interface IntrospectionResponse {
  data?: {
    __type?: {
      name: string
      kind: string
      fields?: GraphQLField[]
      enumValues?: GraphQLEnumValue[]
    }
  }
  errors?: Array<{ message: string }>
}

// ============================================================================
// Category Defaults
// ============================================================================

export const CATEGORY_DEFAULTS: Record<FieldCategory, boolean> = {
  system: true, // id, handle - always needed
  timestamp: true, // createdAt, updatedAt
  count: true, // lightweight aggregation
  scalar: true, // simple values
  enum: true, // status, productType
  object: false, // nested objects - need subfields
  connection: false, // paginated lists - complex
  polymorphic: false, // interfaces/unions - need fragments
  contextual: false, // need args
  computed: false, // potentially expensive
  metafield: false, // optional metafields
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
      return { error: `Shopify API error: ${response.status} ${response.statusText}` }
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
// Type Introspection Queries
// ============================================================================

const TYPE_INTROSPECTION_QUERY = `
query TypeIntrospection($name: String!) {
  __type(name: $name) {
    name
    kind
    description
    fields {
      name
      description
      isDeprecated
      deprecationReason
      args {
        name
        defaultValue
        type { kind name ofType { kind name ofType { kind name } } }
      }
      type {
        kind
        name
        ofType { kind name ofType { kind name ofType { kind name } } }
      }
    }
    enumValues {
      name
      description
      isDeprecated
    }
  }
}
`

const SUBFIELDS_QUERY = `
query TypeSubfields($name: String!) {
  __type(name: $name) {
    fields {
      name
      type { kind name ofType { kind name } }
    }
  }
}
`

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Unwrap NON_NULL and LIST wrappers to get the base type
 */
function unwrap(t: GraphQLTypeRef | null | undefined): { kind: string; name: string } {
  let cur = t
  while (cur && (cur.kind === 'NON_NULL' || cur.kind === 'LIST')) {
    cur = cur.ofType
  }
  return { kind: cur?.kind || 'UNKNOWN', name: cur?.name || 'Unknown' }
}

/**
 * Check if a type is NON_NULL
 */
function isNonNull(t: GraphQLTypeRef | null | undefined): boolean {
  return t?.kind === 'NON_NULL'
}

/**
 * Cache for subfield introspection results
 */
const subfieldCache = new Map<string, string[]>()

/**
 * Get scalar/enum subfields of a type
 */
async function getScalarSubfieldsOf(typeName: string): Promise<string[]> {
  if (subfieldCache.has(typeName)) {
    return subfieldCache.get(typeName)!
  }

  const { data, error } = await shopifyGraphQL<{
    __type?: { fields?: Array<{ name: string; type: GraphQLTypeRef }> }
  }>(SUBFIELDS_QUERY, { name: typeName })

  if (error || !data?.__type?.fields) {
    subfieldCache.set(typeName, [])
    return []
  }

  const scalars = data.__type.fields
    .filter((f) => {
      const typeInfo = f.type.kind === 'NON_NULL' ? f.type.ofType : f.type
      return ['SCALAR', 'ENUM'].includes(typeInfo?.kind || '')
    })
    .map((f) => f.name)

  subfieldCache.set(typeName, scalars)
  return scalars
}

/**
 * Categorize a field based on its schema information
 * Rules are applied in priority order (first match wins)
 */
function categorize(
  field: GraphQLField,
  base: { kind: string; name: string }
): { category: FieldCategory; reason: string } {
  const name = field.name

  // RULE 1: System/Identity fields
  if (['id', 'handle', 'legacyResourceId', 'defaultCursor'].includes(name)) {
    return {
      category: 'system',
      reason: 'Core identifier field used for references and lookups.',
    }
  }

  // RULE 2: Timestamp fields
  if (['createdAt', 'updatedAt', 'publishedAt'].includes(name)) {
    return {
      category: 'timestamp',
      reason: 'Date/time metadata field.',
    }
  }

  // RULE 3: Count fields
  if (base.name === 'Count' || name.endsWith('Count')) {
    return {
      category: 'count',
      reason: 'Count type; returns aggregation data.',
    }
  }

  // RULE 4: Fields with required arguments
  const hasRequiredArg =
    Array.isArray(field.args) &&
    field.args.some((a) => isNonNull(a.type) && a.defaultValue === null)

  if (hasRequiredArg) {
    return {
      category: 'contextual',
      reason: 'Requires arguments to query.',
    }
  }

  // RULE 5: Computed/expensive fields
  if (['contextualPricing', 'restrictedForResource', 'feedback'].includes(name)) {
    return {
      category: 'computed',
      reason: 'Computed field that may be expensive to fetch.',
    }
  }

  // RULE 6: Metafield-related
  if (name === 'metafields' || name === 'metafield' || name.startsWith('metafield')) {
    return {
      category: 'metafield',
      reason: 'Metafield accessor requiring namespace/key.',
    }
  }

  // RULE 7: Enum types
  if (base.kind === 'ENUM') {
    return {
      category: 'enum',
      reason: 'Enumeration with fixed set of values.',
    }
  }

  // RULE 8: Scalar types
  if (base.kind === 'SCALAR') {
    return {
      category: 'scalar',
      reason: 'Returns a direct value; no sub-selection required.',
    }
  }

  // RULE 9: Polymorphic types (Interface/Union)
  if (base.kind === 'INTERFACE' || base.kind === 'UNION') {
    return {
      category: 'polymorphic',
      reason: 'Interface/union type; needs inline fragments for concrete types.',
    }
  }

  // RULE 10: Connection types (paginated lists)
  if (base.kind === 'OBJECT' && base.name?.endsWith('Connection')) {
    return {
      category: 'connection',
      reason: 'Paginated connection; requires edges/node selection and pagination args.',
    }
  }

  // RULE 11: Plain object types (default)
  return {
    category: 'object',
    reason: 'Object type with subfields; needs sub-selection.',
  }
}

// ============================================================================
// Main Introspection Function
// ============================================================================

/**
 * Introspect a Shopify entity type and return categorized fields
 */
export async function introspectEntityType(
  entityType: string,
  options?: { refresh?: boolean }
): Promise<IntrospectionResult> {
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

  // Check cache first (unless refresh requested)
  if (!options?.refresh) {
    const cached = await prisma.shopifySchemaCache.findUnique({
      where: { entityType },
    })

    if (cached) {
      const cachedData = JSON.parse(cached.schemaJson) as IntrospectionField[]
      const isStale = cached.apiVersion !== apiVersion

      return {
        entityType,
        apiVersion: cached.apiVersion,
        fields: cachedData,
        cachedAt: cached.fetchedAt.toISOString(),
        isStale,
      }
    }
  }

  // Fetch fresh schema from Shopify
  const { data, error } = await shopifyGraphQL<IntrospectionResponse['data']>(
    TYPE_INTROSPECTION_QUERY,
    { name: entityType }
  )

  if (error) {
    throw new Error(`Failed to introspect ${entityType}: ${error}`)
  }

  if (!data?.__type) {
    throw new Error(`Type ${entityType} not found in Shopify schema`)
  }

  const rawFields = data.__type.fields || []

  // Process and categorize each field
  const fields: IntrospectionField[] = await Promise.all(
    rawFields.map(async (f) => {
      const base = unwrap(f.type)
      const meta = categorize(f, base)

      const field: IntrospectionField = {
        name: f.name,
        description: f.description,
        kind: base.kind,
        baseType: base.name,
        category: meta.category,
        reason: meta.reason,
        isDeprecated: f.isDeprecated,
        deprecationReason: f.deprecationReason || undefined,
        hasRequiredArgs:
          Array.isArray(f.args) &&
          f.args.some((a) => isNonNull(a.type) && a.defaultValue === null),
      }

      // Get subfields for OBJECT types
      if (base.kind === 'OBJECT') {
        try {
          field.subfields = await getScalarSubfieldsOf(base.name)
        } catch {
          field.subfields = []
        }
      }

      return field
    })
  )

  // Sort by category then name
  fields.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

  // Cache the result
  const now = new Date()
  await prisma.shopifySchemaCache.upsert({
    where: { entityType },
    update: {
      apiVersion,
      schemaJson: JSON.stringify(fields),
      fetchedAt: now,
    },
    create: {
      entityType,
      apiVersion,
      schemaJson: JSON.stringify(fields),
      fetchedAt: now,
    },
  })

  return {
    entityType,
    apiVersion,
    fields,
    cachedAt: now.toISOString(),
    isStale: false,
  }
}

/**
 * Get enum values for a specific enum type
 */
export async function introspectEnumType(enumTypeName: string): Promise<string[]> {
  const { data, error } = await shopifyGraphQL<IntrospectionResponse['data']>(
    TYPE_INTROSPECTION_QUERY,
    { name: enumTypeName }
  )

  if (error || !data?.__type?.enumValues) {
    return []
  }

  return data.__type.enumValues.map((v) => v.name)
}

// ============================================================================
// Entity List
// ============================================================================

export interface ShopifyEntity {
  name: string
  displayName: string
  hasMetafields: boolean
}

/**
 * Get list of known Shopify entity types that can be introspected
 */
export function getKnownEntities(): ShopifyEntity[] {
  return [
    { name: 'Product', displayName: 'Product', hasMetafields: true },
    { name: 'ProductVariant', displayName: 'Product Variant', hasMetafields: true },
    { name: 'Collection', displayName: 'Collection', hasMetafields: true },
    { name: 'Order', displayName: 'Order', hasMetafields: true },
    { name: 'Customer', displayName: 'Customer', hasMetafields: true },
    { name: 'InventoryItem', displayName: 'Inventory Item', hasMetafields: false },
  ]
}

// ============================================================================
// Protected Fields
// ============================================================================

/**
 * Default protected fields that cannot be disabled
 * These are essential for the sync system to function
 */
export const PROTECTED_FIELDS: Record<string, string[]> = {
  Product: ['id', 'status', 'handle'],
  ProductVariant: ['id', 'sku', 'price', 'inventoryQuantity'],
}

/**
 * Check if a field is protected for an entity type
 */
export function isProtectedField(entityType: string, fieldPath: string): boolean {
  const protectedList = PROTECTED_FIELDS[entityType] || []
  return protectedList.includes(fieldPath)
}
