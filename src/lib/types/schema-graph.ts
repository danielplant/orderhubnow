import type { Node, Edge } from '@xyflow/react'
import type { FieldCategory } from '@/lib/shopify/introspect'

// ============================================================================
// Node Types
// ============================================================================

/**
 * Discriminator for node types in the graph
 */
export type SchemaNodeType = 'entity' | 'field'

/**
 * Data payload for entity nodes (Product, ProductVariant, etc.)
 */
export interface EntityNodeData extends Record<string, unknown> {
  nodeType: 'entity'
  entityName: string        // "ProductVariant"
  displayName: string       // "Product Variant"
  fieldCount: number        // Number of fields in this entity
  isExpanded: boolean       // Whether fields are visible
}

/**
 * Data payload for field nodes
 */
export interface FieldNodeData extends Record<string, unknown> {
  nodeType: 'field'

  // Identity
  fieldName: string         // "price"
  fieldPath: string         // "price" or "price.amount" for nested
  fullPath: string          // "ProductVariant.price.amount"
  parentEntity: string      // "ProductVariant"
  depth: number             // 1 for direct fields, 2+ for nested

  // Schema info (from introspection)
  kind: string              // "SCALAR", "OBJECT", "ENUM", "CONNECTION"
  baseType: string          // "Money", "String", "InventoryItem"
  category: FieldCategory   // "scalar", "object", "connection", etc.
  description?: string      // From Shopify schema docs
  isDeprecated?: boolean

  // Relationship detection
  isRelationship: boolean   // true if baseType is a known entity
  targetEntity?: string     // "InventoryItem" if isRelationship

  // Configuration status
  isEnabled: boolean        // Included in sync?
  isProtected: boolean      // Can't be disabled (id, sku, etc.)
  isMapped: boolean         // Has SQL column mapping?
  mapping?: FieldMapping    // Full mapping config if mapped
  isReadonly: boolean       // True for connection/polymorphic fields (visible but not configurable)
}

// ============================================================================
// Field Mapping (mirrors Prisma model)
// ============================================================================

export interface FieldMapping {
  id: string
  entityType: string
  fieldPath: string
  fullPath: string
  depth: number

  // Target
  targetTable: string | null
  targetColumn: string | null

  // Transform
  transformType: 'direct' | 'parseFloat' | 'parseInt' | 'lookup' | 'custom'
  transformConfig?: Record<string, unknown>

  // Status
  enabled: boolean
  isProtected: boolean
  accessStatus: 'accessible' | 'restricted' | 'untested'
}

// ============================================================================
// React Flow Node/Edge Types
// ============================================================================

/**
 * Union type for all node data variants
 */
export type SchemaNodeData = EntityNodeData | FieldNodeData

/**
 * React Flow node with our custom data
 */
export type SchemaNode = Node<SchemaNodeData, string>

/**
 * Edge types in the graph
 */
export type SchemaEdgeType =
  | 'entity-to-field'      // Entity → its direct fields
  | 'field-to-entity'      // Field → target entity (relationships)
  | 'field-to-subfield'    // Object field → its subfields

/**
 * React Flow edge with our custom data
 */
export interface SchemaEdgeData extends Record<string, unknown> {
  edgeType: SchemaEdgeType
  sourceField?: string     // For field-to-entity edges
  targetEntity?: string    // For field-to-entity edges
}

export type SchemaEdge = Edge<SchemaEdgeData>

// ============================================================================
// Complete Graph Structure
// ============================================================================

/**
 * Complete graph data ready for React Flow
 */
export interface SchemaGraphData {
  nodes: SchemaNode[]
  edges: SchemaEdge[]

  // Metadata
  entityCount: number
  fieldCount: number
  relationshipCount: number

  // Source info
  apiVersion: string
  generatedAt: string
}

// ============================================================================
// Type Guards
// ============================================================================

export function isEntityNode(node: SchemaNode): node is Node<EntityNodeData, string> {
  return node.data.nodeType === 'entity'
}

export function isFieldNode(node: SchemaNode): node is Node<FieldNodeData, string> {
  return node.data.nodeType === 'field'
}

export function isRelationshipField(data: FieldNodeData): boolean {
  return data.isRelationship && !!data.targetEntity
}
