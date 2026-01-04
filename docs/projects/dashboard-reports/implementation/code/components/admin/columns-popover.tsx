/**
 * Columns Popover
 * ============================================================================
 * Column visibility and ordering control for reports.
 * Path: src/components/admin/columns-popover.tsx
 */

'use client';

import * as React from 'react';
import { Columns3, GripVertical, Eye, EyeOff } from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ColumnDefinition } from '@/lib/types/report';

interface ColumnsPopoverProps {
  columns: ColumnDefinition[];
  visibleColumns: string[];
  columnOrder: string[];
  onVisibilityChange: (visibleColumns: string[]) => void;
  onOrderChange: (columnOrder: string[]) => void;
}

export function ColumnsPopover({
  columns,
  visibleColumns,
  columnOrder,
  onVisibilityChange,
  onOrderChange,
}: ColumnsPopoverProps) {
  const [open, setOpen] = React.useState(false);
  
  // Order columns by columnOrder, falling back to original order
  const orderedColumns = React.useMemo(() => {
    if (!columnOrder.length) return columns;
    
    const orderMap = new Map(columnOrder.map((id, i) => [id, i]));
    return [...columns].sort((a, b) => {
      const aOrder = orderMap.get(a.id) ?? Infinity;
      const bOrder = orderMap.get(b.id) ?? Infinity;
      return aOrder - bOrder;
    });
  }, [columns, columnOrder]);

  const toggleColumn = (columnId: string) => {
    if (visibleColumns.includes(columnId)) {
      onVisibilityChange(visibleColumns.filter((id) => id !== columnId));
    } else {
      onVisibilityChange([...visibleColumns, columnId]);
    }
  };

  const showAll = () => {
    onVisibilityChange(columns.map((c) => c.id));
  };

  const resetToDefault = () => {
    onVisibilityChange(columns.filter((c) => c.defaultVisible).map((c) => c.id));
    onOrderChange([]);
  };

  // Simple drag-and-drop using native HTML5 DnD
  const [draggedId, setDraggedId] = React.useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, columnId: string) => {
    setDraggedId(columnId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const currentOrder = columnOrder.length
      ? columnOrder
      : columns.map((c) => c.id);

    const draggedIndex = currentOrder.indexOf(draggedId);
    const targetIndex = currentOrder.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);

    onOrderChange(newOrder);
    setDraggedId(null);
  };

  const visibleCount = visibleColumns.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Columns3 className="h-4 w-4" />
          <span>Columns</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">
            {visibleCount}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Columns</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={showAll}
                className={cn(
                  'text-xs text-muted-foreground hover:text-foreground',
                  focusRing
                )}
              >
                Show all
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                type="button"
                onClick={resetToDefault}
                className={cn(
                  'text-xs text-muted-foreground hover:text-foreground',
                  focusRing
                )}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {orderedColumns.map((col) => {
              const isVisible = visibleColumns.includes(col.id);
              return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, col.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    'hover:bg-muted cursor-grab active:cursor-grabbing',
                    draggedId === col.id && 'opacity-50'
                  )}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <button
                    type="button"
                    onClick={() => toggleColumn(col.id)}
                    className={cn(
                      'flex items-center gap-2 flex-1 text-left',
                      focusRing
                    )}
                  >
                    {isVisible ? (
                      <Eye className="h-4 w-4 text-primary" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={cn(!isVisible && 'text-muted-foreground')}>
                      {col.label}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Drag to reorder. Click eye to toggle visibility.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
