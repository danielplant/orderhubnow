'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Lock, Check, Circle, Eye, AlertTriangle, Link2, ChevronRight } from 'lucide-react'
import { FIELD_STYLES, STATUS_COLORS, getCategoryStyle } from './node-styles'
import type { FieldNodeData } from '@/lib/types/schema-graph'

// ============================================================================
// Field Node Component
// ============================================================================

/**
 * Custom React Flow node for Shopify fields.
 * Features:
 * - Color-coded by category (scalar, object, enum, relationship, etc.)
 * - Status icons (protected, enabled, disabled, readonly, deprecated)
 * - Type badge showing baseType
 * - Left handle (receives edge from entity/parent)
 * - Right handle (for relationships or object subfields)
 */
function FieldNodeComponent({ data }: NodeProps) {
  const d = data as FieldNodeData
  const style = getCategoryStyle(d.category)

  // Determine status icon based on field state
  const StatusIcon = d.isProtected
    ? Lock
    : d.isReadonly
      ? Eye
      : d.isEnabled
        ? Check
        : Circle

  const statusColor = d.isProtected
    ? STATUS_COLORS.protected
    : d.isReadonly
      ? STATUS_COLORS.readonly
      : d.isEnabled
        ? STATUS_COLORS.enabled
        : STATUS_COLORS.disabled

  return (
    <div
      className={`
        ${FIELD_STYLES.container}
        ${style.border}
        ${style.bg}
        ${d.depth === 2 ? FIELD_STYLES.depth2 : ''}
        ${d.isDeprecated ? 'opacity-60' : ''}
      `}
    >
      {/* Left handle (receives edge from entity or parent field) */}
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2" />

      {/* Content */}
      <div className={FIELD_STYLES.header}>
        {/* Field name with status icon */}
        <span className={`${FIELD_STYLES.name} ${d.isDeprecated ? FIELD_STYLES.deprecated : ''}`}>
          <StatusIcon className={`h-3.5 w-3.5 ${statusColor}`} />
          {d.fieldName}
          {d.isDeprecated && <AlertTriangle className={`h-3 w-3 ${STATUS_COLORS.deprecated}`} />}
        </span>

        {/* Type badge and relationship/subfield indicators */}
        <div className="flex items-center gap-1">
          <span className={`${FIELD_STYLES.typeBadge} ${style.bg} ${style.text}`}>
            {d.baseType}
          </span>
          {d.isRelationship && <Link2 className={`h-3.5 w-3.5 ${STATUS_COLORS.relationship}`} />}
          {d.kind === 'OBJECT' && !d.isRelationship && (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
        </div>
      </div>

      {/* Right handle (for relationships or subfields) */}
      {(d.isRelationship || d.kind === 'OBJECT') && (
        <Handle type="source" position={Position.Right} className="!bg-purple-400 !w-2 !h-2" />
      )}
    </div>
  )
}

export const FieldNode = memo(FieldNodeComponent)
