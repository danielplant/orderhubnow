'use client'

import * as React from 'react'
import { Calendar, X } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from './popover'
import { Button } from './button'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface DateRange {
  from: string | null // ISO date string (YYYY-MM-DD)
  to: string | null
}

export interface DateRangePopoverProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

// ============================================================================
// Preset Helpers
// ============================================================================

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getToday(): DateRange {
  const today = formatDate(new Date())
  return { from: today, to: today }
}

function getLast7Days(): DateRange {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 7)
  return { from: formatDate(from), to: formatDate(today) }
}

function getLast30Days(): DateRange {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 30)
  return { from: formatDate(from), to: formatDate(today) }
}

function getThisMonth(): DateRange {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: formatDate(from), to: formatDate(today) }
}

function getLastMonth(): DateRange {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const to = new Date(today.getFullYear(), today.getMonth(), 0) // Last day of previous month
  return { from: formatDate(from), to: formatDate(to) }
}

function getThisQuarter(): DateRange {
  const today = new Date()
  const quarter = Math.floor(today.getMonth() / 3)
  const from = new Date(today.getFullYear(), quarter * 3, 1)
  return { from: formatDate(from), to: formatDate(today) }
}

function getThisYear(): DateRange {
  const today = new Date()
  const from = new Date(today.getFullYear(), 0, 1)
  return { from: formatDate(from), to: formatDate(today) }
}

// ============================================================================
// Display Helpers
// ============================================================================

function formatDisplayDate(isoDate: string): string {
  const date = new Date(isoDate + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDisplayText(range: DateRange): string | null {
  if (!range.from && !range.to) return null
  if (range.from && range.to) {
    if (range.from === range.to) {
      return formatDisplayDate(range.from)
    }
    return `${formatDisplayDate(range.from)} – ${formatDisplayDate(range.to)}`
  }
  if (range.from) return `From ${formatDisplayDate(range.from)}`
  if (range.to) return `To ${formatDisplayDate(range.to)}`
  return null
}

// ============================================================================
// Component
// ============================================================================

export function DateRangePopover({ value, onChange, className }: DateRangePopoverProps) {
  const [open, setOpen] = React.useState(false)
  const [localFrom, setLocalFrom] = React.useState(value.from || '')
  const [localTo, setLocalTo] = React.useState(value.to || '')

  // Sync local state when external value changes
  React.useEffect(() => {
    setLocalFrom(value.from || '')
    setLocalTo(value.to || '')
  }, [value.from, value.to])

  const hasValue = value.from || value.to
  const displayText = getDisplayText(value)

  // Validation: To must be >= From
  const isInvalid = Boolean(localFrom && localTo && localTo < localFrom)

  const handlePreset = (preset: DateRange) => {
    setLocalFrom(preset.from || '')
    setLocalTo(preset.to || '')
  }

  const handleApply = () => {
    if (isInvalid) return
    onChange({
      from: localFrom || null,
      to: localTo || null,
    })
    setOpen(false)
  }

  const handleClear = () => {
    setLocalFrom('')
    setLocalTo('')
    onChange({ from: null, to: null })
    setOpen(false)
  }

  const handleClearExternal = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ from: null, to: null })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-background text-sm',
            'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            hasValue && 'border-primary/50 bg-primary/5',
            className
          )}
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className={cn(hasValue ? 'text-foreground' : 'text-muted-foreground')}>
            {displayText || 'Date Range'}
          </span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClearExternal}
              onKeyDown={(e) => e.key === 'Enter' && handleClearExternal(e as unknown as React.MouseEvent)}
              className="ml-1 rounded-full p-0.5 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h4 className="font-medium text-sm">Date Range</h4>
        </div>

        {/* Presets */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs text-muted-foreground mb-2">Quick Select</p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handlePreset(getToday())}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handlePreset(getLast7Days())}
            >
              Last 7 days
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handlePreset(getLast30Days())}
            >
              Last 30 days
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handlePreset(getThisMonth())}
            >
              This month
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handlePreset(getLastMonth())}
            >
              Last month
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handlePreset(getThisQuarter())}
            >
              This quarter
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handlePreset(getThisYear())}
            >
              This year
            </Button>
          </div>
        </div>

        {/* Custom Range */}
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground">Custom Range</p>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="date-from" className="text-sm w-12">
                From
              </label>
              <input
                id="date-from"
                type="date"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                className={cn(
                  'flex-1 h-9 px-3 rounded-md border bg-background text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isInvalid ? 'border-destructive' : 'border-input'
                )}
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="date-to" className="text-sm w-12">
                To
              </label>
              <input
                id="date-to"
                type="date"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
                className={cn(
                  'flex-1 h-9 px-3 rounded-md border bg-background text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isInvalid ? 'border-destructive' : 'border-input'
                )}
              />
            </div>

            {isInvalid && (
              <p className="text-xs text-destructive">
                End date must be after start date
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between px-4 py-3 border-t border-border bg-muted/30">
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={isInvalid}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
