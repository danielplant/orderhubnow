'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { ShopifySyncHistoryEntry } from '@/lib/types/shopify'
import { AlertTriangle, X } from 'lucide-react'

interface SyncHistoryListProps {
  history: ShopifySyncHistoryEntry[]
}

/**
 * Format a date for display - only call on client side to avoid hydration issues.
 */
function formatSyncTime(date: Date): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Client-only time display to avoid hydration mismatches.
 */
function SyncTimeDisplay({ date }: { date: Date }) {
  const [formatted, setFormatted] = React.useState<string | null>(null)

  React.useEffect(() => {
    setFormatted(formatSyncTime(date))
  }, [date])

  // Render placeholder during SSR, actual time after hydration
  if (formatted === null) {
    return <span className="text-muted-foreground">--</span>
  }

  return <span className="text-muted-foreground">{formatted}</span>
}

function getStatusIcon(status: ShopifySyncHistoryEntry['status']) {
  switch (status) {
    case 'completed':
      return <span className="inline-block w-2 h-2 rounded-full bg-success" />
    case 'partial':
      return <AlertTriangle className="h-4 w-4 text-warning" />
    case 'failed':
      return <X className="h-4 w-4 text-destructive" />
    default:
      return <span className="inline-block w-2 h-2 rounded-full bg-muted" />
  }
}

function getStatusLabel(status: ShopifySyncHistoryEntry['status']) {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'partial':
      return 'Partial'
    case 'failed':
      return 'Failed'
    default:
      return 'Unknown'
  }
}

export function SyncHistoryList({ history }: SyncHistoryListProps) {
  if (history.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No sync history available
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {history.map((entry, index) => (
        <div
          key={index}
          className="flex items-center justify-between py-3 px-4 text-sm"
        >
          <div className="flex items-center gap-3">
            {getStatusIcon(entry.status)}
            <SyncTimeDisplay date={entry.syncTime} />
          </div>
          <div className="flex items-center gap-4">
            <span
              className={cn(
                'text-sm',
                entry.status === 'completed' && 'text-foreground',
                entry.status === 'partial' && 'text-warning',
                entry.status === 'failed' && 'text-destructive'
              )}
            >
              {getStatusLabel(entry.status)}
            </span>
            <span className="text-muted-foreground">
              {entry.itemCount} items
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
