'use client'

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RepPillProps {
  repId: string
  repName: string
  locked?: boolean
  className?: string
}

/**
 * RepPill - displays rep name as a locked badge/pill
 * 
 * Used in SaveDraftModal to show the attributed sales rep.
 * When locked, shows a lock icon indicating the value cannot be changed.
 */
export function RepPill({ repId, repName, locked = true, className }: RepPillProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-muted border border-border text-sm font-medium',
        locked && 'cursor-default',
        className
      )}
      title={locked ? `Sales Rep: ${repName} (locked)` : `Sales Rep: ${repName}`}
    >
      {locked && (
        <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="text-foreground">{repName}</span>
      <span className="text-muted-foreground text-xs">#{repId}</span>
    </div>
  )
}
