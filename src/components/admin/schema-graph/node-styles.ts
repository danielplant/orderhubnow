/**
 * Battery Pack: Centralized styling for schema graph nodes.
 * Swap these values to retheme the entire graph.
 */

// ============================================================================
// Category Color Mapping
// ============================================================================

export const CATEGORY_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  relationship: { border: 'border-purple-400', bg: 'bg-purple-50', text: 'text-purple-700' },
  object: { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
  enum: { border: 'border-green-400', bg: 'bg-green-50', text: 'text-green-700' },
  scalar: { border: 'border-slate-300', bg: 'bg-white', text: 'text-slate-700' },
  timestamp: { border: 'border-cyan-400', bg: 'bg-cyan-50', text: 'text-cyan-700' },
  system: { border: 'border-slate-400', bg: 'bg-slate-50', text: 'text-slate-600' },
  connection: { border: 'border-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  count: { border: 'border-teal-400', bg: 'bg-teal-50', text: 'text-teal-700' },
  default: { border: 'border-gray-300', bg: 'bg-gray-50', text: 'text-gray-700' },
}

// ============================================================================
// Entity Node Styles
// ============================================================================

export const ENTITY_STYLES = {
  container: 'rounded-lg shadow-md border-2 border-blue-500 overflow-hidden min-w-[260px]',
  header:
    'bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 flex items-center justify-between',
  title: 'font-semibold flex items-center gap-2',
  badge: 'bg-blue-700/50 text-white text-xs px-2 py-0.5 rounded-full',
  chevron: 'transition-transform duration-200',
  chevronExpanded: 'rotate-90',
}

// ============================================================================
// Field Node Styles
// ============================================================================

export const FIELD_STYLES = {
  container: 'rounded border-2 px-3 py-2 min-w-[220px] shadow-sm transition-all',
  header: 'flex items-center justify-between gap-2',
  name: 'font-medium text-sm flex items-center gap-1.5',
  typeBadge: 'text-xs px-1.5 py-0.5 rounded font-mono',
  deprecated: 'line-through opacity-60',
  depth2: 'ml-4 border-l-2 border-dashed',
}

// ============================================================================
// Status Icon Colors
// ============================================================================

export const STATUS_COLORS = {
  protected: 'text-amber-500',
  enabled: 'text-green-500',
  disabled: 'text-slate-400',
  readonly: 'text-blue-400',
  deprecated: 'text-red-400',
  relationship: 'text-purple-500',
}

// ============================================================================
// MiniMap Colors
// ============================================================================

export const MINIMAP_COLORS = {
  entity: '#3b82f6',
  field: '#94a3b8',
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] || CATEGORY_STYLES.default
}
