'use client'

import * as React from 'react'
import { cn, focusRing } from '@/lib/utils'

export interface BulkActionsBarProps {
  count: number
  actions: Array<{
    label: string
    onClick: () => void
    variant?: 'default' | 'destructive'
    disabled?: boolean
  }>
  onClear: () => void
  className?: string
}

/**
 * BulkActionsBar - appears when table rows are selected.
 * Shows selection count, action buttons, and a clear button.
 */
export function BulkActionsBar({ count, actions, onClear, className }: BulkActionsBarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-md border border-border bg-background px-4 py-2',
        className
      )}
      role="region"
      aria-label="Bulk actions"
    >
      <div className="text-sm text-muted-foreground">
        <span className="text-foreground font-medium">{count}</span> selected
      </div>

      <div className="flex items-center gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              focusRing,
              a.disabled
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : a.variant === 'destructive'
                  ? 'text-error hover:bg-error/10'
                  : 'text-foreground hover:bg-muted/50'
            )}
          >
            {a.label}
          </button>
        ))}

        <button
          type="button"
          onClick={onClear}
          className={cn(
            'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50',
            focusRing
          )}
        >
          Clear
        </button>
      </div>
    </div>
  )
}
