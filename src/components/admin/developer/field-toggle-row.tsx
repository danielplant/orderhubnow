'use client'

/**
 * Field Toggle Row Component
 *
 * Individual field row for the field configuration panel.
 * Shows field name, type, description, protected status, and access status.
 */

import { Lock, Circle, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AccessStatus = 'accessible' | 'restricted' | 'untested'

export interface FieldToggleRowProps {
  name: string
  baseType: string
  description?: string
  enabled: boolean
  isProtected: boolean
  accessStatus?: AccessStatus
  onChange: (enabled: boolean) => void
}

function AccessStatusBadge({ status }: { status: AccessStatus }) {
  switch (status) {
    case 'accessible':
      return (
        <span className="flex items-center gap-1 text-xs text-green-600" title="Field is accessible">
          <CheckCircle className="h-3.5 w-3.5" />
        </span>
      )
    case 'restricted':
      return (
        <span className="flex items-center gap-1 text-xs text-red-600" title="Field access restricted">
          <XCircle className="h-3.5 w-3.5" />
        </span>
      )
    case 'untested':
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Access not tested">
          <Circle className="h-3.5 w-3.5" />
        </span>
      )
  }
}

export function FieldToggleRow({
  name,
  baseType,
  description,
  enabled,
  isProtected,
  accessStatus = 'untested',
  onChange,
}: FieldToggleRowProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
        isProtected
          ? 'bg-muted/30 cursor-not-allowed border-muted'
          : 'border-border hover:bg-muted/50 cursor-pointer'
      )}
    >
      <input
        type="checkbox"
        checked={enabled}
        disabled={isProtected}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          'h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary',
          isProtected && 'opacity-50'
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
            {baseType}
          </span>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <AccessStatusBadge status={accessStatus} />
        {isProtected && (
          <span title="Protected field - cannot be disabled">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
      </div>
    </label>
  )
}
