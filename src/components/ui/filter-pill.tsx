'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface FilterPillOption {
  value: string
  label: string
  count?: number
}

export interface FilterPillProps {
  /** Label shown when no value is selected */
  label: string
  /** Currently selected value (null = no selection) */
  value: string | null
  /** Options to display in dropdown */
  options: FilterPillOption[]
  /** Callback when selection changes */
  onChange: (value: string | null) => void
  /** Placeholder text for the "All" option (defaults to "All {label}s") */
  allLabel?: string
  /** Additional className for the trigger button */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * FilterPill - A pill-style dropdown filter component.
 * 
 * Features:
 * - Rounded pill button that opens a popover dropdown
 * - Filled/inverted style when a value is selected
 * - "All" option to clear selection
 * - Optional counts displayed next to options
 */
export function FilterPill({
  label,
  value,
  options,
  onChange,
  allLabel,
  className,
}: FilterPillProps) {
  const [open, setOpen] = React.useState(false)

  // Don't render if no options
  if (options.length === 0) return null

  // Find the selected option's label for display
  const selectedOption = options.find((o) => o.value === value)
  const displayText = selectedOption?.label ?? value ?? label

  // Default "All" label
  const allLabelText = allLabel ?? `All ${label}s`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'rounded-full px-4 gap-1.5',
            value && 'bg-foreground text-background hover:bg-foreground/90 hover:text-background',
            className
          )}
        >
          {displayText}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 max-h-[300px] overflow-y-auto" align="start">
        <div className="flex flex-col gap-0.5">
          {/* "All" option to clear selection */}
          <button
            type="button"
            className={cn(
              'text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors',
              !value && 'bg-muted font-medium'
            )}
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          >
            {allLabelText}
          </button>

          {/* Option list */}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                'text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors flex items-center justify-between gap-2',
                value === option.value && 'bg-muted font-medium'
              )}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span className="truncate">{option.label}</span>
              {option.count !== undefined && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {option.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
