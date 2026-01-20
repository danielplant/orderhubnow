'use client'

import * as React from 'react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Settings2 } from 'lucide-react'

export interface ColumnConfig {
  id: string
  label: string
  visible: boolean
  required?: boolean // Cannot be hidden (e.g., Order #, Actions)
}

export interface ColumnVisibilityToggleProps {
  columns: ColumnConfig[]
  onChange: (columnId: string, visible: boolean) => void
  onReset: () => void
  /** Only show hidden count badge after hydration to prevent SSR mismatch */
  isHydrated?: boolean
}

/**
 * ColumnVisibilityToggle - Dropdown to show/hide table columns.
 * Required columns cannot be hidden. State is typically persisted to localStorage.
 */
export function ColumnVisibilityToggle({
  columns,
  onChange,
  onReset,
  isHydrated = true,
}: ColumnVisibilityToggleProps) {
  const hiddenCount = columns.filter((c) => !c.visible && !c.required).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Columns
          {isHydrated && hiddenCount > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
              {hiddenCount} hidden
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" avoidCollisions={false}>
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {columns.map((col) => (
            <DropdownMenuCheckboxItem
              key={col.id}
              checked={col.visible}
              disabled={col.required}
              onCheckedChange={(checked) => onChange(col.id, checked)}
              className="pr-8"
            >
              <span className="flex-1">{col.label}</span>
              {col.required && (
                <span className="text-xs text-muted-foreground">Required</span>
              )}
            </DropdownMenuCheckboxItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <button
          type="button"
          onClick={onReset}
          className="w-full px-2 py-1.5 text-sm text-left hover:bg-muted rounded-sm text-muted-foreground hover:text-foreground"
        >
          Reset to default
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
