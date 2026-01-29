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

// ============================================================================
// Enhanced Cache Types
// ============================================================================

export type CacheCategory = 'entity' | 'object_type' | 'enum' | 'metafield'

export interface MetafieldInfo {
  namespace: string
  key: string
  displayName?: string
  description?: string
  dataType?: string
  source: 'definition' | 'sampled' | 'manual'
}

export interface SchemaCacheResult {
  entityCount: number
  objectTypeCount: number
  enumCount: number
  metafieldCount: number
  errors: string[]
  durationMs: number
}

export interface ProgressCallback {
  (step: string, current: number, total: number): void
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
// Metafield Owner Types
// ============================================================================

export const METAFIELD_OWNER_TYPES = [
  'ARTICLE', 'BLOG', 'COLLECTION', 'COMPANY', 'COMPANY_LOCATION',
  'CUSTOMER', 'DISCOUNT', 'DRAFTORDER', 'LOCATION', 'MARKET',
  'ORDER', 'PAGE', 'PRODUCT', 'PRODUCTVARIANT', 'SHOP'
] as const

export type MetafieldOwnerType = typeof METAFIELD_OWNER_TYPES[number]

/**
 * Maps MetafieldOwnerType to GraphQL query root field.
 * SHOP is singleton (no collection query).
 */
export const OWNER_TYPE_QUERY_MAP: Record<MetafieldOwnerType, { query: string; isSingleton: boolean }> = {
  ARTICLE: { query: 'articles', isSingleton: false },
  BLOG: { query: 'blogs', isSingleton: false },
  COLLECTION: { query: 'collections', isSingleton: false },
  COMPANY: { query: 'companies', isSingleton: false },
  COMPANY_LOCATION: { query: 'companyLocations', isSingleton: false },
  CUSTOMER: { query: 'customers', isSingleton: false },
  DISCOUNT: { query: 'discountNodes', isSingleton: false },
  DRAFTORDER: { query: 'draftOrders', isSingleton: false },
  LOCATION: { query: 'locations', isSingleton: false },
  MARKET: { query: 'markets', isSingleton: false },
  ORDER: { query: 'orders', isSingleton: false },
  PAGE: { query: 'pages', isSingleton: false },
  PRODUCT: { query: 'products', isSingleton: false },
  PRODUCTVARIANT: { query: 'productVariants', isSingleton: false },
  SHOP: { query: 'shop', isSingleton: true },
}

// Default connection ID for single-tenant mode
export const DEFAULT_CONNECTION_ID = 'default'

// ============================================================================
// Introspection Settings Helper
// ============================================================================

async function getIntrospectionSettings(): Promise<{ recordSampleSize: number; metafieldLimit: number }> {
  const settings = await prisma.syncSettings.findFirst()
  return {
    recordSampleSize: settings?.introspectRecordSampleSize ?? 250,
    metafieldLimit: settings?.introspectMetafieldLimit ?? 100,
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
    const cached = await prisma.shopifyTypeCache.findFirst({
      where: {
        category: 'entity',
        typeName: entityType,
      },
    })

    if (cached && cached.schemaJson) {
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
  const cacheKey = buildCacheKey('entity', entityType)
  await prisma.shopifyTypeCache.upsert({
    where: { connectionId_cacheKey: { connectionId: DEFAULT_CONNECTION_ID, cacheKey } },
    update: {
      schemaJson: JSON.stringify(fields),
      apiVersion,
      fetchedAt: now,
    },
    create: {
      connectionId: DEFAULT_CONNECTION_ID,
      cacheKey,
      category: 'entity',
      typeName: entityType,
      schemaJson: JSON.stringify(fields),
      apiVersion,
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
  Collection: ['id'],
  Order: ['id', 'name'],
  Customer: ['id', 'email'],
  InventoryItem: ['id', 'sku'],
}

/**
 * Check if a field is protected for an entity type
 */
export function isProtectedField(entityType: string, fieldPath: string): boolean {
  const protectedList = PROTECTED_FIELDS[entityType] || []
  return protectedList.includes(fieldPath)
}

// ============================================================================
// Cache Key Helpers
// ============================================================================

function buildCacheKey(
  category: CacheCategory,
  typeName?: string,
  ownerType?: string,
  namespace?: string,
  key?: string
): string {
  switch (category) {
    case 'entity':
    case 'object_type':
      return `type:${typeName}`
    case 'enum':
      return `enum:${typeName}`
    case 'metafield':
      return `metafield:${ownerType}:${namespace}:${key}`
  }
}

// ============================================================================
// Type Introspection Functions
// ============================================================================

/**
 * Introspect any GraphQL type (entity or object type).
 * Returns IntrospectionField[] or null if type not found.
 */
async function introspectGraphQLType(typeName: string): Promise<IntrospectionField[] | null> {
  const { data, error } = await shopifyGraphQL<IntrospectionResponse['data']>(
    TYPE_INTROSPECTION_QUERY,
    { name: typeName }
  )

  if (error || !data?.__type?.fields) {
    return null
  }

  const rawFields = data.__type.fields
  const fields: IntrospectionField[] = rawFields.map((f) => {
    const base = unwrap(f.type)
    const meta = categorize(f, base)
    return {
      name: f.name,
      description: f.description,
      kind: base.kind,
      baseType: base.name,
      category: meta.category,
      reason: meta.reason,
      isDeprecated: f.isDeprecated,
      deprecationReason: f.deprecationReason || undefined,
      hasRequiredArgs: Array.isArray(f.args) &&
        f.args.some((a) => isNonNull(a.type) && a.defaultValue === null),
    }
  })

  return fields
}

/**
 * Introspect enum type and return its values.
 */
async function introspectEnumValues(enumTypeName: string): Promise<string[] | null> {
  const { data, error } = await shopifyGraphQL<IntrospectionResponse['data']>(
    TYPE_INTROSPECTION_QUERY,
    { name: enumTypeName }
  )

  if (error || !data?.__type?.enumValues) {
    return null
  }

  return data.__type.enumValues.map((v) => v.name)
}

/**
 * Cache a type (entity or object_type) to ShopifyTypeCache.
 */
async function cacheType(
  category: 'entity' | 'object_type',
  typeName: string,
  fields: IntrospectionField[],
  apiVersion: string,
  connectionId: string = DEFAULT_CONNECTION_ID
): Promise<void> {
  const cacheKey = buildCacheKey(category, typeName)
  await prisma.shopifyTypeCache.upsert({
    where: { connectionId_cacheKey: { connectionId, cacheKey } },
    update: {
      schemaJson: JSON.stringify(fields),
      apiVersion,
      fetchedAt: new Date(),
    },
    create: {
      connectionId,
      cacheKey,
      category,
      typeName,
      schemaJson: JSON.stringify(fields),
      apiVersion,
      fetchedAt: new Date(),
    },
  })
}

/**
 * Cache an enum to ShopifyTypeCache.
 */
async function cacheEnum(
  typeName: string,
  values: string[],
  apiVersion: string,
  connectionId: string = DEFAULT_CONNECTION_ID
): Promise<void> {
  const cacheKey = buildCacheKey('enum', typeName)
  await prisma.shopifyTypeCache.upsert({
    where: { connectionId_cacheKey: { connectionId, cacheKey } },
    update: {
      enumValues: JSON.stringify(values),
      apiVersion,
      fetchedAt: new Date(),
    },
    create: {
      connectionId,
      cacheKey,
      category: 'enum',
      typeName,
      enumValues: JSON.stringify(values),
      apiVersion,
      fetchedAt: new Date(),
    },
  })
}

/**
 * Recursively introspect a type and all referenced object types and enums.
 * Stops at SCALAR types and already-visited types.
 */
async function introspectWithFullDepth(
  typeName: string,
  category: 'entity' | 'object_type',
  visited: Set<string>,
  apiVersion: string,
  connectionId: string = DEFAULT_CONNECTION_ID
): Promise<{ types: number; enums: number }> {
  if (visited.has(typeName)) {
    return { types: 0, enums: 0 }
  }
  visited.add(typeName)

  const fields = await introspectGraphQLType(typeName)
  if (!fields) {
    return { types: 0, enums: 0 }
  }

  await cacheType(category, typeName, fields, apiVersion, connectionId)
  let typesCount = 1
  let enumsCount = 0

  // Find all referenced types
  for (const field of fields) {
    if (field.kind === 'OBJECT' && !visited.has(field.baseType)) {
      // Skip known entities - they'll be processed at top level
      const isKnownEntity = getKnownEntities().some(e => e.name === field.baseType)
      if (!isKnownEntity) {
        const result = await introspectWithFullDepth(
          field.baseType,
          'object_type',
          visited,
          apiVersion,
          connectionId
        )
        typesCount += result.types
        enumsCount += result.enums
      }
    } else if (field.kind === 'ENUM' && !visited.has(field.baseType)) {
      visited.add(field.baseType)
      const values = await introspectEnumValues(field.baseType)
      if (values) {
        await cacheEnum(field.baseType, values, apiVersion, connectionId)
        enumsCount++
      }
    }
  }

  return { types: typesCount, enums: enumsCount }
}

// ============================================================================
// Metafield Discovery Functions
// ============================================================================

const METAFIELD_DEFINITIONS_QUERY = `
query MetafieldDefinitions($ownerType: MetafieldOwnerType!) {
  metafieldDefinitions(ownerType: $ownerType, first: 250) {
    edges {
      node {
        namespace
        key
        name
        description
        type { name }
      }
    }
  }
}
`

async function queryMetafieldDefinitions(ownerType: MetafieldOwnerType): Promise<MetafieldInfo[]> {
  const { data, error } = await shopifyGraphQL<{
    metafieldDefinitions: {
      edges: Array<{
        node: {
          namespace: string
          key: string
          name: string
          description?: string
          type: { name: string }
        }
      }>
    }
  }>(METAFIELD_DEFINITIONS_QUERY, { ownerType })

  if (error || !data?.metafieldDefinitions?.edges) {
    return []
  }

  return data.metafieldDefinitions.edges.map(({ node }) => ({
    namespace: node.namespace,
    key: node.key,
    displayName: node.name,
    description: node.description,
    dataType: node.type.name,
    source: 'definition' as const,
  }))
}

function buildSamplingQuery(
  ownerType: MetafieldOwnerType,
  recordLimit: number,
  metafieldLimit: number
): string {
  const config = OWNER_TYPE_QUERY_MAP[ownerType]
  
  if (config.isSingleton) {
    // SHOP is singleton
    return `
      query SampleShopMetafields {
        shop {
          metafields(first: ${metafieldLimit}) {
            edges {
              node { namespace key type }
            }
          }
        }
      }
    `
  }

  return `
    query Sample${ownerType}Metafields {
      ${config.query}(first: ${recordLimit}, reverse: true) {
        edges {
          node {
            metafields(first: ${metafieldLimit}) {
              edges {
                node { namespace key type }
              }
            }
          }
        }
      }
    }
  `
}

async function querySampleMetafields(
  ownerType: MetafieldOwnerType,
  recordLimit: number,
  metafieldLimit: number
): Promise<MetafieldInfo[]> {
  const query = buildSamplingQuery(ownerType, recordLimit, metafieldLimit)
  const config = OWNER_TYPE_QUERY_MAP[ownerType]

  const { data, error } = await shopifyGraphQL<Record<string, unknown>>(query)

  if (error || !data) {
    return []
  }

  const seen = new Set<string>()
  const results: MetafieldInfo[] = []

  // Extract metafields from response
  const extractMetafields = (node: { metafields?: { edges: Array<{ node: { namespace: string; key: string; type: string } }> } }) => {
    if (!node.metafields?.edges) return
    for (const { node: mf } of node.metafields.edges) {
      const uniqueKey = `${mf.namespace}:${mf.key}`
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey)
        results.push({
          namespace: mf.namespace,
          key: mf.key,
          dataType: mf.type,
          source: 'sampled',
        })
      }
    }
  }

  if (config.isSingleton) {
    const shop = data[config.query] as { metafields?: { edges: Array<{ node: { namespace: string; key: string; type: string } }> } }
    if (shop) extractMetafields(shop)
  } else {
    const collection = data[config.query] as { edges?: Array<{ node: { metafields?: { edges: Array<{ node: { namespace: string; key: string; type: string } }> } } }> }
    if (collection?.edges) {
      for (const { node } of collection.edges) {
        extractMetafields(node)
      }
    }
  }

  return results
}

function mergeMetafields(definitions: MetafieldInfo[], sampled: MetafieldInfo[]): MetafieldInfo[] {
  const merged = new Map<string, MetafieldInfo>()

  // Definitions take priority (richer metadata)
  for (const mf of definitions) {
    merged.set(`${mf.namespace}:${mf.key}`, mf)
  }

  // Add sampled ones not in definitions
  for (const mf of sampled) {
    const key = `${mf.namespace}:${mf.key}`
    if (!merged.has(key)) {
      merged.set(key, mf)
    }
  }

  return Array.from(merged.values())
}

async function cacheMetafields(
  ownerType: MetafieldOwnerType,
  metafields: MetafieldInfo[],
  apiVersion: string,
  connectionId: string = DEFAULT_CONNECTION_ID
): Promise<void> {
  for (const mf of metafields) {
    const cacheKey = buildCacheKey('metafield', undefined, ownerType, mf.namespace, mf.key)
    await prisma.shopifyTypeCache.upsert({
      where: { connectionId_cacheKey: { connectionId, cacheKey } },
      update: {
        displayName: mf.displayName,
        description: mf.description,
        dataType: mf.dataType,
        source: mf.source,
        apiVersion,
        fetchedAt: new Date(),
      },
      create: {
        connectionId,
        cacheKey,
        category: 'metafield',
        ownerType,
        namespace: mf.namespace,
        key: mf.key,
        displayName: mf.displayName,
        description: mf.description,
        dataType: mf.dataType,
        source: mf.source,
        apiVersion,
        fetchedAt: new Date(),
      },
    })
  }
}

async function discoverMetafieldsForOwnerType(
  ownerType: MetafieldOwnerType,
  apiVersion: string,
  connectionId: string,
  recordSampleSize: number,
  metafieldLimit: number
): Promise<number> {
  const definitions = await queryMetafieldDefinitions(ownerType)
  const sampled = await querySampleMetafields(ownerType, recordSampleSize, metafieldLimit)
  const merged = mergeMetafields(definitions, sampled)
  await cacheMetafields(ownerType, merged, apiVersion, connectionId)
  return merged.length
}

// ============================================================================
// Manual Metafield Entry
// ============================================================================

/**
 * Manually add a metafield to the cache.
 * Use when a metafield isn't discovered by definitions or sampling.
 */
export async function addManualMetafield(
  ownerType: MetafieldOwnerType,
  namespace: string,
  key: string,
  options?: {
    displayName?: string
    dataType?: string
    description?: string
    connectionId?: string
  }
): Promise<void> {
  const connectionId = options?.connectionId ?? DEFAULT_CONNECTION_ID
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'
  const cacheKey = buildCacheKey('metafield', undefined, ownerType, namespace, key)

  await prisma.shopifyTypeCache.upsert({
    where: { connectionId_cacheKey: { connectionId, cacheKey } },
    update: {
      displayName: options?.displayName,
      dataType: options?.dataType,
      description: options?.description,
      source: 'manual',
      apiVersion,
      fetchedAt: new Date(),
    },
    create: {
      connectionId,
      cacheKey,
      category: 'metafield',
      ownerType,
      namespace,
      key,
      displayName: options?.displayName,
      dataType: options?.dataType,
      description: options?.description,
      source: 'manual',
      apiVersion,
      fetchedAt: new Date(),
    },
  })
}

/**
 * Delete a manually-added metafield from the cache.
 */
export async function deleteManualMetafield(
  ownerType: MetafieldOwnerType,
  namespace: string,
  key: string,
  connectionId: string = DEFAULT_CONNECTION_ID
): Promise<void> {
  const cacheKey = buildCacheKey('metafield', undefined, ownerType, namespace, key)

  await prisma.shopifyTypeCache.deleteMany({
    where: {
      connectionId,
      cacheKey,
      source: 'manual',
    },
  })
}

// ============================================================================
// Main Orchestration Function
// ============================================================================

/**
 * Clear and rebuild the entire schema cache.
 * Introspects all entities, object types, enums, and metafields.
 */
export async function refreshSchemaCache(
  connectionId: string = DEFAULT_CONNECTION_ID,
  onProgress?: ProgressCallback
): Promise<SchemaCacheResult> {
  const startTime = Date.now()
  const refreshStartedAt = new Date()
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'
  const errors: string[] = []
  const visited = new Set<string>()

  // Fetch introspection settings
  const { recordSampleSize, metafieldLimit } = await getIntrospectionSettings()

  let entityCount = 0
  let objectTypeCount = 0
  let enumCount = 0
  let metafieldCount = 0

  // Calculate total steps (estimate)
  const entities = getKnownEntities()
  const totalSteps = entities.length + METAFIELD_OWNER_TYPES.length * 2
  let currentStep = 0

  // NOTE: We no longer delete at start - upserts will update existing entries
  // Stale entries are cleaned up at the end if no errors occurred

  // 1. Introspect known entities with full depth
  for (const entity of entities) {
    try {
      onProgress?.(`Introspecting ${entity.name}`, ++currentStep, totalSteps)
      const result = await introspectWithFullDepth(entity.name, 'entity', visited, apiVersion, connectionId)
      entityCount++
      objectTypeCount += result.types - 1 // Subtract the entity itself
      enumCount += result.enums
    } catch (err) {
      errors.push(`Failed to introspect ${entity.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // 2. Discover metafields for each owner type
  for (const ownerType of METAFIELD_OWNER_TYPES) {
    try {
      onProgress?.(`Fetching ${ownerType} metafield definitions`, ++currentStep, totalSteps)
      onProgress?.(`Sampling ${ownerType} records`, ++currentStep, totalSteps)
      const count = await discoverMetafieldsForOwnerType(ownerType, apiVersion, connectionId, recordSampleSize, metafieldLimit)
      metafieldCount += count
    } catch (err) {
      errors.push(`Failed to discover ${ownerType} metafields: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // 3. Clean up stale entries (entries not touched in this refresh)
  // Only delete if we had no critical errors
  if (errors.length === 0) {
    await prisma.shopifyTypeCache.deleteMany({
      where: {
        connectionId,
        fetchedAt: { lt: refreshStartedAt },
      },
    })
  }

  return {
    entityCount,
    objectTypeCount,
    enumCount,
    metafieldCount,
    errors,
    durationMs: Date.now() - startTime,
  }
}
