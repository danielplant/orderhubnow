'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { ViewMode, ArchiveTrashCounts } from '@/lib/types/order'
import { Archive, Trash2, FileText } from 'lucide-react'

interface ViewModeTabsProps {
  counts: ArchiveTrashCounts
  current: ViewMode
  onChange: (mode: ViewMode) => void
}

export function ViewModeTabs({ counts, current, onChange }: ViewModeTabsProps) {
  const tabs: Array<{ mode: ViewMode; label: string; count: number; icon: React.ReactNode }> = [
    { 
      mode: 'active', 
      label: 'Active', 
      count: counts.active,
      icon: <FileText className="h-4 w-4" />
    },
    { 
      mode: 'archived', 
      label: 'Archived', 
      count: counts.archived,
      icon: <Archive className="h-4 w-4" />
    },
    { 
      mode: 'trashed', 
      label: 'Trash', 
      count: counts.trashed,
      icon: <Trash2 className="h-4 w-4" />
    },
  ]

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.mode}
          onClick={() => onChange(tab.mode)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            current === tab.mode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded-full',
            current === tab.mode
              ? 'bg-muted text-muted-foreground'
              : 'bg-background/50 text-muted-foreground'
          )}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  )
}
