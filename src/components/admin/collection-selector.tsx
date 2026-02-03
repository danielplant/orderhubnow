'use client'

import * as React from 'react'
import { X, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui'
import type { CategoryForFilter } from '@/lib/types'

// ============================================================================
// Types
// ============================================================================

export type CollectionFilterMode = 'all' | 'ats' | 'preorder' | 'specific'

interface CollectionSelectorProps {
  collections: CategoryForFilter[]
  mode: CollectionFilterMode
  selectedIds: number[]
  onModeChange: (mode: CollectionFilterMode) => void
  onSelectionChange: (ids: number[]) => void
}

// ============================================================================
// Component
// ============================================================================

export function CollectionSelector({
  collections,
  mode,
  selectedIds,
  onModeChange,
  onSelectionChange,
}: CollectionSelectorProps) {
  // Group collections by type
  const atsCollections = collections.filter((c) => c.type === 'ats')
  const preorderCollections = collections.filter((c) => c.type === 'preorder_no_po' || c.type === 'preorder_po')

  // Get selected collection objects
  const selectedCollections = collections.filter((c) => selectedIds.includes(c.id))

  // Handle radio selection
  const handleRadioChange = (newMode: CollectionFilterMode) => {
    onModeChange(newMode)
    // Note: Don't call onSelectionChange here - the parent derives selectedIds from URL.
    // When mode changes to non-specific, the URL update handles everything.
  }

  // Handle adding a collection to selection
  const handleAddCollection = (id: number) => {
    if (!selectedIds.includes(id)) {
      onSelectionChange([...selectedIds, id])
    }
  }

  // Handle removing a collection from selection
  const handleRemoveCollection = (id: number) => {
    onSelectionChange(selectedIds.filter((sid) => sid !== id))
  }

  // Available collections (not yet selected)
  const availableAts = atsCollections.filter((c) => !selectedIds.includes(c.id))
  const availablePreorder = preorderCollections.filter((c) => !selectedIds.includes(c.id))

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Collections
      </div>

      {/* Radio Options */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <RadioOption
          label="All Collections"
          checked={mode === 'all'}
          onChange={() => handleRadioChange('all')}
        />
        <RadioOption
          label="All ATS Collections"
          checked={mode === 'ats'}
          onChange={() => handleRadioChange('ats')}
        />
        <RadioOption
          label="All Pre-Order Collections"
          checked={mode === 'preorder'}
          onChange={() => handleRadioChange('preorder')}
        />
        <RadioOption
          label="Select Specific"
          checked={mode === 'specific'}
          onChange={() => handleRadioChange('specific')}
        />
      </div>

      {/* Collection Chips + Add Button (only when specific mode) */}
      {mode === 'specific' && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Selected collection chips */}
          {selectedCollections.map((c) => (
            <CollectionChip
              key={c.id}
              name={c.name}
              type={c.type}
              onRemove={() => handleRemoveCollection(c.id)}
            />
          ))}

          {/* Add Collection dropdown */}
          {(availableAts.length > 0 || availablePreorder.length > 0) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/40 bg-transparent px-3 py-1.5 text-sm text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors"
                >
                  + Add Collection
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
                {availableAts.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      ATS Collections
                    </DropdownMenuLabel>
                    {availableAts.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => handleAddCollection(c.id)}
                        className="cursor-pointer"
                      >
                        {c.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {availableAts.length > 0 && availablePreorder.length > 0 && (
                  <DropdownMenuSeparator />
                )}
                {availablePreorder.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Pre-Order Collections
                    </DropdownMenuLabel>
                    {availablePreorder.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => handleAddCollection(c.id)}
                        className="cursor-pointer"
                      >
                        {c.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Empty state */}
          {selectedCollections.length === 0 && (
            <span className="text-sm text-muted-foreground italic">
              No collections selected
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function RadioOption({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div
      role="radio"
      aria-checked={checked}
      tabIndex={0}
      className="flex items-center gap-2 cursor-pointer"
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange()
        }
      }}
    >
      <div
        className={cn(
          'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
          checked
            ? 'border-primary bg-primary'
            : 'border-muted-foreground/40 hover:border-muted-foreground'
        )}
      >
        {checked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <span className="text-sm">{label}</span>
    </div>
  )
}

function CollectionChip({
  name,
  type,
  onRemove,
}: {
  name: string
  type: string
  onRemove: () => void
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
        type === 'ats'
          ? 'bg-green-100 text-green-800'
          : 'bg-purple-100 text-purple-800'
      )}
    >
      {name}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-black/10 transition-colors"
        aria-label={`Remove ${name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}
