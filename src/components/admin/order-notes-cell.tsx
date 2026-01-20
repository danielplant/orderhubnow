'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { updateOrderNotes } from '@/lib/data/actions/orders'
import { Check, X, Edit2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OrderNotesCellProps {
  orderId: string
  initialNotes: string | null
  onUpdate?: () => void
}

/**
 * OrderNotesCell - Inline-editable notes cell for variance explanations.
 * Shipping team can click to edit and save notes directly in the table.
 */
export function OrderNotesCell({ orderId, initialNotes, onUpdate }: OrderNotesCellProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [notes, setNotes] = React.useState(initialNotes || '')
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await updateOrderNotes({ orderId, notes: notes.trim() })
      if (result.success) {
        setIsEditing(false)
        onUpdate?.()
      } else {
        setError(result.error || 'Failed to save')
      }
    } catch {
      setError('Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setNotes(initialNotes || '')
    setIsEditing(false)
    setError(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Sync with prop changes (e.g., after server refresh)
  React.useEffect(() => {
    if (!isEditing) {
      setNotes(initialNotes || '')
    }
  }, [initialNotes, isEditing])

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-7 text-xs w-28',
            error && 'border-destructive focus-visible:ring-destructive'
          )}
          placeholder="Add note..."
          disabled={isSaving}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-success hover:text-success"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={handleCancel}
          disabled={isSaving}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  const displayNotes = initialNotes || notes

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className={cn(
        'group flex items-center gap-1 text-xs text-left max-w-[100px] truncate rounded px-1 py-0.5 -mx-1',
        'hover:bg-muted/50 transition-colors',
        displayNotes ? 'text-foreground' : 'text-muted-foreground'
      )}
      title={displayNotes || 'Click to add note'}
    >
      <span className="truncate">{displayNotes || '—'}</span>
      <Edit2 className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
