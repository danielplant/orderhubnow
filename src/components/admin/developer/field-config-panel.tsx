'use client'

/**
 * Field Configuration Panel
 *
 * Main container for configuring Shopify sync fields.
 * Groups fields by category with collapsible sections.
 * Includes bulk actions for batch enable/disable operations.
 */

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Loader2, Zap, RotateCcw, ToggleLeft, ToggleRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FieldToggleRow, AccessStatus } from './field-toggle-row'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type FieldCategory =
  | 'system'
  | 'timestamp'
  | 'count'
  | 'scalar'
  | 'enum'
  | 'object'
  | 'connection'
  | 'polymorphic'
  | 'contextual'
  | 'computed'
  | 'metafield'

export interface FieldConfig {
  fieldPath: string
  fieldType: string
  category: FieldCategory
  description?: string
  enabled: boolean
  isProtected: boolean
  isMetafield?: boolean
  accessStatus?: AccessStatus
}

export interface FieldConfigPanelProps {
  entityType: string
  fields: FieldConfig[]
  onFieldChange: (fieldPath: string, enabled: boolean) => void
  onBulkAction: (action: 'enable-scalars' | 'disable-non-protected' | 'reset') => void
  onProbeFields: () => void
  isProbing?: boolean
  probeProgress?: { current: number; total: number }
  hasUnsavedChanges?: boolean
}

// ============================================================================
// Category Metadata
// ============================================================================

const CATEGORY_LABELS: Record<FieldCategory, string> = {
  system: 'System Fields',
  timestamp: 'Timestamp Fields',
  count: 'Count Fields',
  scalar: 'Scalar Fields',
  enum: 'Enum Fields',
  object: 'Object Fields',
  connection: 'Connection Fields',
  polymorphic: 'Polymorphic Fields',
  contextual: 'Contextual Fields',
  computed: 'Computed Fields',
  metafield: 'Metafields',
}

const CATEGORY_DESCRIPTIONS: Record<FieldCategory, string> = {
  system: 'Core identifiers - required for sync',
  timestamp: 'Date/time metadata',
  count: 'Aggregation counts',
  scalar: 'Simple string/number values',
  enum: 'Fixed set of values',
  object: 'Nested objects - require subfield selection',
  connection: 'Paginated lists - complex queries',
  polymorphic: 'Interface/union types - need fragments',
  contextual: 'Fields requiring arguments',
  computed: 'Potentially expensive computed values',
  metafield: 'Custom metafield definitions',
}

// Categories that are collapsed by default
const COLLAPSED_BY_DEFAULT: FieldCategory[] = ['object', 'connection', 'polymorphic', 'contextual', 'computed']

// Order of categories in the UI
const CATEGORY_ORDER: FieldCategory[] = [
  'system',
  'scalar',
  'enum',
  'timestamp',
  'count',
  'object',
  'connection',
  'polymorphic',
  'contextual',
  'computed',
  'metafield',
]

// ============================================================================
// Category Section Component
// ============================================================================

interface CategorySectionProps {
  category: FieldCategory
  fields: FieldConfig[]
  isExpanded: boolean
  onToggle: () => void
  onFieldChange: (fieldPath: string, enabled: boolean) => void
  onCategoryToggle: (enabled: boolean) => void
}

function CategorySection({
  category,
  fields,
  isExpanded,
  onToggle,
  onFieldChange,
  onCategoryToggle,
}: CategorySectionProps) {
  const enabledCount = fields.filter((f) => f.enabled).length
  const protectedCount = fields.filter((f) => f.isProtected).length
  const canToggle = fields.some((f) => !f.isProtected)
  const allNonProtectedEnabled = fields.filter((f) => !f.isProtected).every((f) => f.enabled)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Category Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">{CATEGORY_LABELS[category]}</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({enabledCount}/{fields.length} enabled)
          </span>
        </div>
        {/* Category toggle checkbox */}
        {canToggle && (
          <div
            onClick={(e) => {
              e.stopPropagation()
              onCategoryToggle(!allNonProtectedEnabled)
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-2 py-1 rounded hover:bg-muted"
          >
            {allNonProtectedEnabled ? (
              <ToggleRight className="h-4 w-4 text-primary" />
            ) : (
              <ToggleLeft className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">All</span>
          </div>
        )}
      </button>

      {/* Category Description */}
      {isExpanded && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border bg-muted/10">
          {CATEGORY_DESCRIPTIONS[category]}
          {protectedCount > 0 && (
            <span className="ml-2 text-muted-foreground/70">
              ({protectedCount} protected)
            </span>
          )}
        </div>
      )}

      {/* Fields */}
      {isExpanded && (
        <div className="p-2 space-y-1">
          {fields.map((field) => (
            <FieldToggleRow
              key={field.fieldPath}
              name={field.fieldPath}
              baseType={field.fieldType}
              description={field.description}
              enabled={field.enabled}
              isProtected={field.isProtected}
              accessStatus={field.accessStatus}
              onChange={(enabled) => onFieldChange(field.fieldPath, enabled)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FieldConfigPanel({
  entityType,
  fields,
  onFieldChange,
  onBulkAction,
  onProbeFields,
  isProbing = false,
  probeProgress,
  hasUnsavedChanges = false,
}: FieldConfigPanelProps) {
  // Track expanded/collapsed state for each category
  const [expandedCategories, setExpandedCategories] = useState<Set<FieldCategory>>(() => {
    const expanded = new Set<FieldCategory>(CATEGORY_ORDER)
    COLLAPSED_BY_DEFAULT.forEach((cat) => expanded.delete(cat))
    return expanded
  })

  // Group fields by category
  const fieldsByCategory = useMemo(() => {
    const grouped = new Map<FieldCategory, FieldConfig[]>()

    // Initialize all categories
    CATEGORY_ORDER.forEach((cat) => grouped.set(cat, []))

    // Group fields
    for (const field of fields) {
      const category = field.category || 'scalar'
      const existing = grouped.get(category) || []
      existing.push(field)
      grouped.set(category, existing)
    }

    // Sort fields within each category by name
    grouped.forEach((categoryFields) => {
      categoryFields.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath))
    })

    return grouped
  }, [fields])

  const toggleCategory = (category: FieldCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const handleCategoryToggle = (category: FieldCategory, enabled: boolean) => {
    const categoryFields = fieldsByCategory.get(category) || []
    for (const field of categoryFields) {
      if (!field.isProtected) {
        onFieldChange(field.fieldPath, enabled)
      }
    }
  }

  // Calculate stats
  const totalFields = fields.length
  const enabledFields = fields.filter((f) => f.enabled).length
  const protectedFields = fields.filter((f) => f.isProtected).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Field Configuration
              {hasUnsavedChanges && (
                <span className="text-xs font-medium px-2 py-1 rounded-full border border-amber-600 text-amber-600">
                  Unsaved
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Configure which {entityType} fields to sync from Shopify.
              {totalFields > 0 && (
                <span className="ml-1">
                  {enabledFields}/{totalFields} fields enabled ({protectedFields} protected).
                </span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Bulk Actions */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
          <span className="text-sm text-muted-foreground mr-2 w-full sm:w-auto">Bulk Actions:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkAction('enable-scalars')}
            disabled={isProbing}
          >
            <ToggleRight className="h-4 w-4 mr-1.5" />
            Enable All Scalars
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkAction('disable-non-protected')}
            disabled={isProbing}
          >
            <ToggleLeft className="h-4 w-4 mr-1.5" />
            Disable Non-Protected
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkAction('reset')}
            disabled={isProbing}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset to Defaults
          </Button>
          <div className="hidden sm:block flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={onProbeFields}
            disabled={isProbing}
            className={cn(isProbing && 'animate-pulse')}
          >
            {isProbing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {probeProgress
                  ? `Probing ${probeProgress.current}/${probeProgress.total}...`
                  : 'Probing...'}
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1.5" />
                Probe All Fields
              </>
            )}
          </Button>
        </div>

        {/* Category Sections */}
        {fields.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No fields available. Click &quot;Refresh Schema&quot; to load fields from Shopify.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {CATEGORY_ORDER.map((category) => {
              const categoryFields = fieldsByCategory.get(category) || []
              if (categoryFields.length === 0) return null

              return (
                <CategorySection
                  key={category}
                  category={category}
                  fields={categoryFields}
                  isExpanded={expandedCategories.has(category)}
                  onToggle={() => toggleCategory(category)}
                  onFieldChange={onFieldChange}
                  onCategoryToggle={(enabled) => handleCategoryToggle(category, enabled)}
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
