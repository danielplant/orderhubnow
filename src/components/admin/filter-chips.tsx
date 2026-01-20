'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterChip {
  key: string
  label: string
  value: string
  onRemove: () => void
}

export interface FilterChipsProps {
  filters: FilterChip[]
  onClearAll?: () => void
  className?: string
}

/**
 * FilterChips - Visual indicators of active filters with one-click removal.
 * Shows a row of filter chips with X buttons and optional "Clear all" action.
 */
export function FilterChips({ filters, onClearAll, className }: FilterChipsProps) {
  if (filters.length === 0) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-sm text-muted-foreground">Filters:</span>
      {filters.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={filter.onRemove}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            'bg-primary/10 text-primary hover:bg-primary/20 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1'
          )}
        >
          <span className="text-primary/70">{filter.label}:</span>
          <span>{filter.value}</span>
          <X className="h-3 w-3 ml-0.5 hover:text-primary/80" />
        </button>
      ))}
      {filters.length > 1 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
