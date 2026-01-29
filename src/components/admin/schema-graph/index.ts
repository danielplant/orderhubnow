/**
 * Schema Graph Components
 *
 * Custom React Flow node components for the Shopify schema visualization.
 */

// Component exports
export { EntityNode } from './EntityNode'
export { FieldNode } from './FieldNode'
export { FieldConfigModal } from './FieldConfigModal'
export { MappingsTable } from './MappingsTable'
export { ServiceSelector } from './ServiceSelector'
export { ValidationPanel } from './ValidationPanel'

// Style exports (battery pack)
export * from './node-styles'

// Node types registry
import { EntityNode } from './EntityNode'
import { FieldNode } from './FieldNode'

/**
 * CRITICAL: Define nodeTypes outside component to prevent re-registration on every render.
 * This is a React Flow performance requirement.
 */
export const schemaNodeTypes = {
  entity: EntityNode,
  field: FieldNode,
} as const
