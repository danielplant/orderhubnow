'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export interface InlineEditProps {
  value: string | number
  type: 'text' | 'number' | 'date'
  onSave: (newValue: string) => Promise<void>
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function InlineEdit({
  value,
  type,
  onSave,
  disabled,
  placeholder,
  className,
}: InlineEditProps) {
  const display = useMemo(() => (value ?? '').toString(), [value])

  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState(display)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) setLocalValue(display)
  }, [display, editing])

  async function commit() {
    if (disabled) return
    if (localValue === display) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(localValue)
      setEditing(false)
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <input
          className={cn(
            'h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
          )}
          type={type}
          value={localValue}
          placeholder={placeholder}
          disabled={disabled || saving}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
            if (e.key === 'Escape') {
              setLocalValue(display)
              setEditing(false)
            }
          }}
          autoFocus
        />
        {error ? <span className="text-xs text-muted-foreground">{error}</span> : null}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-8 items-center rounded-md px-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
      disabled={disabled}
      onClick={() => setEditing(true)}
      aria-label="Edit value"
    >
      {display || <span className="text-muted-foreground">{placeholder ?? '—'}</span>}
    </button>
  )
}
