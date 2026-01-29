'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Database, ChevronRight } from 'lucide-react'
import { ENTITY_STYLES } from './node-styles'
import type { EntityNodeData } from '@/lib/types/schema-graph'

// ============================================================================
// Entity Node Component
// ============================================================================

/**
 * Custom React Flow node for Shopify entities (Product, ProductVariant, etc.)
 * Features:
 * - Blue gradient header
 * - Field count badge
 * - Expand/collapse chevron
 * - Bottom handle for edges to child fields
 */
function EntityNodeComponent({ data }: NodeProps) {
  const { displayName, fieldCount, isExpanded, onToggle } = data as EntityNodeData & {
    onToggle?: () => void
  }

  return (
    <div className={ENTITY_STYLES.container}>
      {/* Header - clickable to expand/collapse */}
      <button
        onClick={onToggle}
        className={`${ENTITY_STYLES.header} w-full cursor-pointer hover:from-blue-600 hover:to-blue-700`}
      >
        <span className={ENTITY_STYLES.title}>
          <Database className="h-4 w-4" />
          {displayName}
        </span>
        <div className="flex items-center gap-2">
          <span className={ENTITY_STYLES.badge}>{fieldCount}</span>
          <ChevronRight
            className={`h-4 w-4 ${ENTITY_STYLES.chevron} ${
              isExpanded ? ENTITY_STYLES.chevronExpanded : ''
            }`}
          />
        </div>
      </button>

      {/* Bottom handle for edges to fields */}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  )
}

export const EntityNode = memo(EntityNodeComponent)
