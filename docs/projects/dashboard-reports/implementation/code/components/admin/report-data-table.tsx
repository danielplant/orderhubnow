/**
 * Report Data Table
 * ============================================================================
 * Generic data table for reports with dynamic columns.
 * Path: src/components/admin/report-data-table.tsx
 */

'use client';

import * as React from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import type { ColumnDefinition } from '@/lib/types/report';

// Badge variants for different types
const BADGE_VARIANTS: Record<string, string> = {
  // Severity
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  
  // Segment
  Platinum: 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
  Gold: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Silver: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  Bronze: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  
  // Health scores
  'reorder-now': 'bg-red-100 text-red-800',
  'reorder-soon': 'bg-amber-100 text-amber-800',
  'monitor': 'bg-blue-100 text-blue-800',
  'overstock': 'bg-purple-100 text-purple-800',
  'discontinue': 'bg-gray-100 text-gray-800',
  
  // Trend
  up: 'bg-green-100 text-green-800',
  flat: 'bg-gray-100 text-gray-800',
  down: 'bg-red-100 text-red-800',
  
  // Quadrant
  stars: 'bg-amber-100 text-amber-800',
  develop: 'bg-blue-100 text-blue-800',
  maintain: 'bg-green-100 text-green-800',
  harvest: 'bg-gray-100 text-gray-800',
  
  // Exception types
  'late-account': 'bg-red-100 text-red-800',
  'declining-account': 'bg-orange-100 text-orange-800',
  'stalled-new-account': 'bg-amber-100 text-amber-800',
  'dead-sku': 'bg-gray-100 text-gray-800',
  'hot-sku': 'bg-green-100 text-green-800',
  'underperforming-rep': 'bg-purple-100 text-purple-800',
};

// Format cell value based on column type
function formatCellValue(value: unknown, type: ColumnDefinition['type']): React.ReactNode {
  if (value === null || value === undefined) return '—';
  
  switch (type) {
    case 'currency':
      return formatCurrency(Number(value));
    case 'number':
      return formatNumber(Number(value));
    case 'percent':
      return `${(Number(value) * 100).toFixed(1)}%`;
    case 'date':
      return new Date(String(value)).toLocaleDateString();
    case 'badge':
      const strValue = String(value);
      const variant = BADGE_VARIANTS[strValue] || 'bg-muted text-muted-foreground';
      return (
        <Badge className={cn('font-normal', variant)}>
          {strValue.replace(/-/g, ' ')}
        </Badge>
      );
    default:
      return String(value);
  }
}

interface ReportDataTableProps<T> {
  data: T[];
  columnDefs: ColumnDefinition[];
  visibleColumns: string[];
  columnOrder: string[];
  getRowId: (row: T) => string;
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
  onSortChange: (columnId: string, direction: 'asc' | 'desc') => void;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  enableRowSelection?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
}

export function ReportDataTable<T extends Record<string, unknown>>({
  data,
  columnDefs,
  visibleColumns,
  columnOrder,
  getRowId,
  sortBy,
  sortDir,
  onSortChange,
  page,
  pageSize,
  totalCount,
  onPageChange,
  enableRowSelection = false,
  onSelectionChange,
}: ReportDataTableProps<T>) {
  // Build ordered, visible columns
  const columns = React.useMemo(() => {
    // Filter to visible columns
    const visible = columnDefs.filter((c) => visibleColumns.includes(c.id));
    
    // Sort by columnOrder if provided
    if (columnOrder.length > 0) {
      const orderMap = new Map(columnOrder.map((id, i) => [id, i]));
      visible.sort((a, b) => {
        const aOrder = orderMap.get(a.id) ?? Infinity;
        const bOrder = orderMap.get(b.id) ?? Infinity;
        return aOrder - bOrder;
      });
    }
    
    // Convert to DataTable columns
    return visible.map((def): DataTableColumn<T> => ({
      id: def.id,
      header: (
        <span className={cn(def.align === 'right' && 'text-right block')}>
          {def.label}
        </span>
      ),
      cell: (row) => {
        const value = row[def.id];
        const formatted = formatCellValue(value, def.type);
        return (
          <span
            className={cn(
              def.align === 'right' && 'text-right block',
              def.type === 'number' && 'tabular-nums',
              def.type === 'currency' && 'tabular-nums'
            )}
          >
            {formatted}
          </span>
        );
      },
      sortValue: def.sortable
        ? (row) => {
            const val = row[def.id];
            if (val === null || val === undefined) return null;
            if (typeof val === 'number') return val;
            return String(val);
          }
        : undefined,
    }));
  }, [columnDefs, visibleColumns, columnOrder]);

  const handleSortChange = React.useCallback(
    (sort: { columnId: string; direction: 'asc' | 'desc' }) => {
      onSortChange(sort.columnId, sort.direction);
    },
    [onSortChange]
  );

  return (
    <DataTable
      data={data}
      columns={columns}
      getRowId={getRowId}
      pageSize={pageSize}
      enableRowSelection={enableRowSelection}
      onSelectionChange={onSelectionChange}
      manualPagination
      page={page}
      totalCount={totalCount}
      onPageChange={onPageChange}
      manualSorting
      sort={sortBy ? { columnId: sortBy, direction: sortDir } : null}
      onSortChange={handleSortChange}
      variant="striped"
    />
  );
}
