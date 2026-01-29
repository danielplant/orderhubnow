'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Lock, Check, AlertTriangle, Link2, Box, Type, List, Info, Loader2, AlertCircle } from 'lucide-react'
import type { FieldNodeData } from '@/lib/types/schema-graph'

// ============================================================================
// Types
// ============================================================================

interface Props {
  field: FieldNodeData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: FieldMappingFormData) => Promise<void>
}

export interface FieldMappingFormData {
  enabled: boolean
  targetTable: string
  targetColumn: string
  transformType: 'direct' | 'parseFloat' | 'parseInt' | 'lookup' | 'custom'
}

// ============================================================================
// Constants
// ============================================================================

const TRANSFORM_OPTIONS = [
  { value: 'direct', label: 'Direct', description: 'Copy value as-is' },
  { value: 'parseFloat', label: 'Parse Float', description: 'Convert to decimal' },
  { value: 'parseInt', label: 'Parse Int', description: 'Convert to integer' },
  { value: 'lookup', label: 'Lookup', description: 'Map via lookup table' },
  { value: 'custom', label: 'Custom', description: 'Custom transform' },
] as const

// ============================================================================
// Helper Components
// ============================================================================

function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'OBJECT':
      return <Box className="w-4 h-4" />
    case 'ENUM':
      return <List className="w-4 h-4" />
    case 'SCALAR':
    default:
      return <Type className="w-4 h-4" />
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function FieldConfigModal({ field, open, onOpenChange, onSave }: Props) {
  // Form state
  const [enabled, setEnabled] = useState(false)
  const [targetTable, setTargetTable] = useState('')
  const [targetColumn, setTargetColumn] = useState('')
  const [transformType, setTransformType] = useState<FieldMappingFormData['transformType']>('direct')

  // UI state
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when field changes
  useEffect(() => {
    if (field) {
      setEnabled(field.isEnabled || field.isProtected)
      setTargetTable(field.mapping?.targetTable || '')
      setTargetColumn(field.mapping?.targetColumn || '')
      setTransformType(field.mapping?.transformType || 'direct')
      setError(null) // Clear any previous error
    }
  }, [field])

  // Clear error when user modifies form
  useEffect(() => {
    if (error) {
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, targetTable, targetColumn, transformType])

  // Track if form has changes
  const hasChanges = useMemo(() => {
    if (!field) return false
    const initialEnabled = field.isEnabled || field.isProtected
    const initialTable = field.mapping?.targetTable || ''
    const initialColumn = field.mapping?.targetColumn || ''
    const initialTransform = field.mapping?.transformType || 'direct'

    return (
      enabled !== initialEnabled ||
      targetTable !== initialTable ||
      targetColumn !== initialColumn ||
      transformType !== initialTransform
    )
  }, [field, enabled, targetTable, targetColumn, transformType])

  // Handle save - async with error handling
  const handleSave = useCallback(async () => {
    // Prevent double-clicks
    if (isSaving) return

    setIsSaving(true)
    setError(null)

    try {
      await onSave({
        enabled,
        targetTable,
        targetColumn,
        transformType,
      })
      // Success: onSave will close the modal via setSelectedField(null)
    } catch (err) {
      // Display error in modal
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }, [enabled, targetTable, targetColumn, transformType, onSave, isSaving])

  // Don't render if no field
  if (!field) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Configure Field Mapping
          </DialogTitle>
          <DialogDescription className="font-mono text-sm">
            {field.fullPath}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Field Information Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Field Information
            </h3>

            {/* Type info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-500">Type</span>
                <div className="flex items-center gap-1.5 mt-1 font-medium">
                  <KindIcon kind={field.kind} />
                  <span>{field.baseType}</span>
                  <span className="text-slate-400">({field.kind})</span>
                </div>
              </div>
              <div>
                <span className="text-slate-500">Category</span>
                <div className="mt-1 font-medium capitalize">{field.category}</div>
              </div>
              <div>
                <span className="text-slate-500">Depth</span>
                <div className="mt-1 font-medium">{field.depth}</div>
              </div>
              <div>
                <span className="text-slate-500">Parent</span>
                <div className="mt-1 font-medium">{field.parentEntity}</div>
              </div>
            </div>

            {/* Description */}
            {field.description && (
              <div>
                <span className="text-sm text-slate-500">Description</span>
                <p className="mt-1 text-sm text-slate-700">{field.description}</p>
              </div>
            )}

            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              {field.isProtected && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                  <Lock className="w-3 h-3" />
                  Protected
                </span>
              )}
              {field.isEnabled && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                  <Check className="w-3 h-3" />
                  Enabled
                </span>
              )}
              {field.isMapped && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                  Mapped
                </span>
              )}
              {field.isRelationship && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                  <Link2 className="w-3 h-3" />
                  {field.targetEntity}
                </span>
              )}
              {field.isDeprecated && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
                  <AlertTriangle className="w-3 h-3" />
                  Deprecated
                </span>
              )}
            </div>
          </div>

          {/* Protected field warning */}
          {field.isProtected && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <Lock className="w-4 h-4 inline mr-1" />
                This is a protected field and is always included in sync.
              </p>
            </div>
          )}

          {/* Sync Configuration Section */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-slate-900">Sync Configuration</h3>

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enabled" className="text-sm font-medium">
                  Include in Sync
                </Label>
                <p className="text-xs text-slate-500 mt-0.5">
                  {field.isProtected
                    ? 'Protected fields are always synced'
                    : 'Enable to sync this field to the database'}
                </p>
              </div>
              <button
                id="enabled"
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={field.isProtected}
                onClick={() => !field.isProtected && setEnabled(!enabled)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${enabled ? 'bg-blue-600' : 'bg-slate-200'}
                  ${field.isProtected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${enabled ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            {/* Mapping fields (only shown when enabled) */}
            {enabled && (
              <div className="space-y-4 pt-2">
                {/* Target Table */}
                <div className="space-y-2">
                  <Label htmlFor="targetTable" className="text-sm">
                    Target Table
                  </Label>
                  <Input
                    id="targetTable"
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value)}
                    placeholder="e.g., Sku, RawSkusFromShopify"
                  />
                </div>

                {/* Target Column */}
                <div className="space-y-2">
                  <Label htmlFor="targetColumn" className="text-sm">
                    Target Column
                  </Label>
                  <Input
                    id="targetColumn"
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    placeholder="e.g., Price, ShopifyVariantId"
                  />
                </div>

                {/* Transform Type */}
                <div className="space-y-2">
                  <Label htmlFor="transformType" className="text-sm">
                    Transform
                  </Label>
                  <Select
                    value={transformType}
                    onValueChange={(v) =>
                      setTransformType(v as FieldMappingFormData['transformType'])
                    }
                  >
                    <SelectTrigger id="transformType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSFORM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-xs text-slate-500 ml-2">
                            - {opt.description}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
