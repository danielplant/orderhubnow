/**
 * Schema Graph Builder
 *
 * Transforms cached Shopify schema data (ShopifyTypeCache) into React Flow
 * nodes and edges for the schema graph UI.
 *
 * This is the bridge between:
 * - Step 3.5's enhanced introspection cache
 * - Steps 6-8's React Flow graph UI
 */

import { prisma } from '@/lib/prisma'
import {
  getKnownEntities,
  isProtectedField,
  DEFAULT_CONNECTION_ID,
  type IntrospectionField,
  type FieldCategory,
  type ShopifyEntity,
} from '@/lib/shopify/introspect'
import type {
  SchemaGraphData,
  SchemaNode,
  SchemaEdge,
  FieldMapping,
  EntityNodeData,
  FieldNodeData,
} from '@/lib/types/schema-graph'

// ============================================================================
// Constants
// ============================================================================

/**
 * Categories to EXCLUDE from graph (not useful for field-level config)
 *
 * - metafield: Accessor fields (metafield(ns, key), metafields(first: N)).
 *              Actual metafields are shown separately from metafield discovery.
 * - contextual: Require arguments (e.g., publishedInContext(context: ContextInput!)).
 *               Can't sync without context.
 * - computed: Derived/expensive fields (e.g., contextualPricing). Not stored data.
 */
const EXCLUDED_CATEGORIES: FieldCategory[] = ['metafield', 'contextual', 'computed']

/**
 * Categories to show but mark as non-configurable
 *
 * - connection: Paginated lists. Show to visualize relationships, but don't expand.
 * - polymorphic: Interfaces/unions need fragments. Complex to configure.
 */
const READONLY_CATEGORIES: FieldCategory[] = ['connection', 'polymorphic']

// Layout constants
const ENTITY_SPACING_X = 400 // Horizontal space between entities
const FIELD_SPACING_Y = 50 // Vertical space between fields
const SUBFIELD_INDENT_X = 40 // Indent for depth-2 subfields
const ENTITY_START_Y = 0 // Y position for entity row
const FIELD_START_Y = 80 // Y position for first field (below entity)

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate unique node ID for React Flow
 */
function nodeId(type: 'entity' | 'field', path: string): string {
  return `${type}:${path}`
}

// ============================================================================
// Data Loading Functions
// ============================================================================

/**
 * Load entity schemas from ShopifyTypeCache.
 * @returns Map of entityName → IntrospectionField[]
 */
async function loadCachedEntities(
  connectionId: string
): Promise<Map<string, IntrospectionField[]>> {
  const rows = await prisma.shopifyTypeCache.findMany({
    where: {
      connectionId,
      category: 'entity',
    },
  })

  const result = new Map<string, IntrospectionField[]>()

  for (const row of rows) {
    if (row.typeName && row.schemaJson) {
      try {
        const fields = JSON.parse(row.schemaJson) as IntrospectionField[]
        result.set(row.typeName, fields)
      } catch {
        // Skip malformed JSON
        console.warn(`Failed to parse schemaJson for entity ${row.typeName}`)
      }
    }
  }

  return result
}

/**
 * Load ALL object types in a single query (batch fetch to avoid N+1).
 * @returns Map of typeName → IntrospectionField[]
 */
async function loadAllObjectTypes(
  connectionId: string
): Promise<Map<string, IntrospectionField[]>> {
  const rows = await prisma.shopifyTypeCache.findMany({
    where: {
      connectionId,
      category: 'object_type',
    },
  })

  const result = new Map<string, IntrospectionField[]>()

  for (const row of rows) {
    if (row.typeName && row.schemaJson) {
      try {
        const fields = JSON.parse(row.schemaJson) as IntrospectionField[]
        result.set(row.typeName, fields)
      } catch {
        console.warn(`Failed to parse schemaJson for object type ${row.typeName}`)
      }
    }
  }

  return result
}

/**
 * Load all field mappings.
 * @returns Map of fullPath → FieldMapping
 */
async function loadFieldMappings(
  connectionId: string
): Promise<Map<string, FieldMapping>> {
  const rows = await prisma.shopifyFieldMapping.findMany({
    where: { connectionId },
  })

  return new Map(
    rows.map((m) => [
      m.fullPath,
      {
        id: String(m.id), // number → string for React key compatibility
        entityType: m.entityType,
        fieldPath: m.fieldPath,
        fullPath: m.fullPath,
        depth: m.depth,
        targetTable: m.targetTable,
        targetColumn: m.targetColumn,
        transformType: m.transformType as FieldMapping['transformType'], // string → union
        transformConfig: m.transformConfig
          ? JSON.parse(m.transformConfig)
          : undefined, // JSON string → object
        enabled: m.enabled,
        isProtected: m.isProtected,
        accessStatus: m.accessStatus as FieldMapping['accessStatus'],
      },
    ])
  )
}

// ============================================================================
// Node Creation Functions
// ============================================================================

/**
 * Create an entity node (Product, ProductVariant, etc.)
 */
function createEntityNode(
  entity: ShopifyEntity,
  fieldCount: number,
  position: { x: number; y: number }
): SchemaNode {
  const data: EntityNodeData = {
    nodeType: 'entity',
    entityName: entity.name,
    displayName: entity.displayName,
    fieldCount,
    isExpanded: true, // Default expanded
  }

  return {
    id: nodeId('entity', entity.name),
    type: 'entity', // React Flow node type (matches custom component in Step 7)
    position,
    data,
  }
}

/**
 * Create a field node with relationship detection
 */
function createFieldNode(
  entityName: string,
  field: IntrospectionField,
  depth: number,
  parentPath: string,
  position: { x: number; y: number },
  mapping: FieldMapping | undefined,
  knownEntityNames: string[]
): SchemaNode {
  // Build field path based on depth
  const fieldPath = depth === 1 ? field.name : `${parentPath}.${field.name}`
  const fullPath = `${entityName}.${fieldPath}`

  // Relationship detection: does baseType match a known entity?
  const isRelationship = knownEntityNames.includes(field.baseType)
  const targetEntity = isRelationship ? field.baseType : undefined

  // Protection check
  const isProtected = isProtectedField(entityName, fieldPath)

  // Readonly check (connection/polymorphic fields are visible but not configurable)
  const isReadonly = READONLY_CATEGORIES.includes(field.category as FieldCategory)

  const data: FieldNodeData = {
    nodeType: 'field',

    // Identity
    fieldName: field.name,
    fieldPath,
    fullPath,
    parentEntity: entityName,
    depth,

    // Schema info
    kind: field.kind,
    baseType: field.baseType,
    category: field.category as FieldCategory,
    description: field.description,
    isDeprecated: field.isDeprecated,

    // Relationship detection
    isRelationship,
    targetEntity,

    // Configuration status
    isEnabled: mapping?.enabled ?? false,
    isProtected,
    isMapped: !!mapping?.targetColumn,
    mapping,
    isReadonly,
  }

  return {
    id: nodeId('field', fullPath),
    type: 'field', // React Flow node type
    position,
    data,
  }
}

/**
 * Expand object type subfields (e.g., price → price.amount, price.currencyCode)
 * Only expands one level (no recursive expansion to avoid depth 3+)
 *
 * NOTE: Uses pre-loaded objectTypesMap to avoid N+1 queries
 */
function expandObjectSubfields(
  entityName: string,
  parentField: IntrospectionField,
  parentPath: string,
  baseX: number,
  baseY: number,
  objectTypesMap: Map<string, IntrospectionField[]>,
  mappings: Map<string, FieldMapping>,
  knownEntityNames: string[]
): { nodes: SchemaNode[]; nextY: number } {
  const nodes: SchemaNode[] = []
  let currentY = baseY

  // Look up subfields from pre-loaded map (no DB query!)
  const subfields = objectTypesMap.get(parentField.baseType)

  if (!subfields) {
    // Object type not cached, skip expansion
    return { nodes, nextY: currentY }
  }

  // Filter to SCALAR and ENUM only (no nested objects at depth 3+)
  const expandableSubfields = subfields.filter(
    (f) => f.kind === 'SCALAR' || f.kind === 'ENUM'
  )

  for (const subfield of expandableSubfields) {
    const subfieldPath = `${parentPath}.${subfield.name}`
    const fullPath = `${entityName}.${subfieldPath}`
    const mapping = mappings.get(fullPath)

    const node = createFieldNode(
      entityName,
      subfield,
      2, // depth 2 for subfields
      parentPath,
      { x: baseX, y: currentY },
      mapping,
      knownEntityNames
    )

    nodes.push(node)
    currentY += FIELD_SPACING_Y
  }

  return { nodes, nextY: currentY }
}

// ============================================================================
// Edge Creation
// ============================================================================

/**
 * Create all edges for the graph
 */
function createEdges(
  nodes: SchemaNode[],
  knownEntityNames: string[]
): SchemaEdge[] {
  const edges: SchemaEdge[] = []

  // Separate nodes by type
  const entityNodes = nodes.filter((n) => n.data.nodeType === 'entity')
  const fieldNodes = nodes.filter((n) => n.data.nodeType === 'field')

  // Create entity-to-field edges (entity → its depth-1 fields)
  for (const entityNode of entityNodes) {
    const entityName = (entityNode.data as EntityNodeData).entityName
    const entityId = entityNode.id

    // Find all depth-1 fields for this entity
    const directFields = fieldNodes.filter((n) => {
      const data = n.data as FieldNodeData
      return data.parentEntity === entityName && data.depth === 1
    })

    for (const fieldNode of directFields) {
      edges.push({
        id: `edge:${entityId}-${fieldNode.id}`,
        source: entityId,
        target: fieldNode.id,
        type: 'smoothstep',
        data: { edgeType: 'entity-to-field' },
      })
    }
  }

  // Create field-to-subfield edges (object field → its depth-2 subfields)
  for (const fieldNode of fieldNodes) {
    const data = fieldNode.data as FieldNodeData

    // Skip if not depth 1 or not an object type
    if (data.depth !== 1 || data.kind !== 'OBJECT') continue

    // Find subfields (depth 2 fields whose path starts with this field's name)
    const subfields = fieldNodes.filter((n) => {
      const subData = n.data as FieldNodeData
      return (
        subData.parentEntity === data.parentEntity &&
        subData.depth === 2 &&
        subData.fieldPath.startsWith(`${data.fieldName}.`)
      )
    })

    for (const subfieldNode of subfields) {
      edges.push({
        id: `edge:${fieldNode.id}-${subfieldNode.id}`,
        source: fieldNode.id,
        target: subfieldNode.id,
        type: 'smoothstep',
        style: { strokeDasharray: '5,5' }, // Dashed for subfield edges
        data: { edgeType: 'field-to-subfield' },
      })
    }
  }

  // Create field-to-entity edges (relationship field → target entity)
  for (const fieldNode of fieldNodes) {
    const data = fieldNode.data as FieldNodeData

    if (!data.isRelationship || !data.targetEntity) continue

    // Find target entity node
    const targetEntityId = nodeId('entity', data.targetEntity)
    const targetExists = entityNodes.some((n) => n.id === targetEntityId)

    if (targetExists) {
      edges.push({
        id: `edge:rel:${fieldNode.id}-${targetEntityId}`,
        source: fieldNode.id,
        target: targetEntityId,
        type: 'smoothstep',
        animated: true, // Animated for relationship edges
        style: { stroke: '#3b82f6' }, // Blue
        data: {
          edgeType: 'field-to-entity',
          sourceField: data.fieldPath,
          targetEntity: data.targetEntity,
        },
      })
    }
  }

  return edges
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Build complete graph data from cached schema.
 *
 * @param connectionId - Tenant ID (defaults to "default")
 * @returns SchemaGraphData or null if cache is empty
 */
export async function buildSchemaGraph(
  connectionId: string = DEFAULT_CONNECTION_ID
): Promise<SchemaGraphData | null> {
  // 1. Get known entities
  const knownEntities = getKnownEntities()
  const knownEntityNames = knownEntities.map((e) => e.name)

  // 2. Load all data in parallel (Fix: avoid sequential awaits)
  const [cachedSchemas, mappings, objectTypesMap] = await Promise.all([
    loadCachedEntities(connectionId),
    loadFieldMappings(connectionId),
    loadAllObjectTypes(connectionId), // Batch-fetch all object types upfront
  ])

  // 3. Check if cache is empty
  if (cachedSchemas.size === 0) {
    return null // Signal "cache not populated" to caller
  }

  // 4. Build nodes and edges
  const nodes: SchemaNode[] = []
  let relationshipCount = 0

  // 5. Process each entity
  for (let i = 0; i < knownEntities.length; i++) {
    const entity = knownEntities[i]
    const fields = cachedSchemas.get(entity.name) || []

    // Filter excluded categories
    const visibleFields = fields.filter(
      (f) => !EXCLUDED_CATEGORIES.includes(f.category as FieldCategory)
    )

    // Entity node position
    const entityX = i * ENTITY_SPACING_X

    // Create entity node
    nodes.push(
      createEntityNode(entity, visibleFields.length, {
        x: entityX,
        y: ENTITY_START_Y,
      })
    )

    // Field nodes
    let currentY = FIELD_START_Y
    for (const field of visibleFields) {
      const fullPath = `${entity.name}.${field.name}`
      const mapping = mappings.get(fullPath)

      // Create field node
      const fieldNode = createFieldNode(
        entity.name,
        field,
        1, // depth 1 for direct fields
        '', // parentPath empty for depth 1
        { x: entityX, y: currentY },
        mapping,
        knownEntityNames
      )
      nodes.push(fieldNode)

      // Track relationships
      if ((fieldNode.data as FieldNodeData).isRelationship) {
        relationshipCount++
      }

      currentY += FIELD_SPACING_Y

      // Expand OBJECT subfields (not CONNECTION or known entities)
      // Uses pre-loaded objectTypesMap - no DB queries in loop!
      if (
        field.kind === 'OBJECT' &&
        !field.baseType.endsWith('Connection') &&
        !knownEntityNames.includes(field.baseType)
      ) {
        const expansion = expandObjectSubfields(
          entity.name,
          field,
          field.name,
          entityX + SUBFIELD_INDENT_X,
          currentY,
          objectTypesMap, // Use pre-loaded map instead of connectionId
          mappings,
          knownEntityNames
        )
        nodes.push(...expansion.nodes)
        currentY = expansion.nextY
      }
    }
  }

  // 6. Create edges
  const edges = createEdges(nodes, knownEntityNames)

  // 7. Get API version from environment
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

  // 8. Return complete graph data
  return {
    nodes,
    edges,
    entityCount: knownEntities.length,
    fieldCount: nodes.filter((n) => n.data.nodeType === 'field').length,
    relationshipCount,
    apiVersion,
    generatedAt: new Date().toISOString(),
  }
}
