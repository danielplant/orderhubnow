/**
 * Report Toolbar
 * ============================================================================
 * Toolbar containing columns, filters, views, and export controls.
 * Path: src/components/admin/report-toolbar.tsx
 */

'use client';

import * as React from 'react';
import { ColumnsPopover } from './columns-popover';
import { FiltersPopover } from './filters-popover';
import { SavedViewsPopover, useSavedViews } from './saved-views-popover';
import { ReportExportButtons } from './report-export-buttons';
import type {
  ReportType,
  ReportConfig,
  FilterState,
  SavedView,
  LayoutMode,
} from '@/lib/types/report';

interface ReportToolbarProps {
  config: ReportConfig;
  visibleColumns: string[];
  columnOrder: string[];
  filters: FilterState[];
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
  layout: LayoutMode;
  filterOptions?: Record<string, Array<{ value: string; label: string }>>;
  onColumnsChange: (visibleColumns: string[]) => void;
  onColumnOrderChange: (columnOrder: string[]) => void;
  onFiltersChange: (filters: FilterState[]) => void;
  onLoadView: (view: SavedView) => void;
  urlParams: Record<string, string>;
}

export function ReportToolbar({
  config,
  visibleColumns,
  columnOrder,
  filters,
  sortBy,
  sortDir,
  layout,
  filterOptions,
  onColumnsChange,
  onColumnOrderChange,
  onFiltersChange,
  onLoadView,
  urlParams,
}: ReportToolbarProps) {
  const savedViewsHook = useSavedViews();

  const currentState = {
    columns: visibleColumns,
    columnOrder,
    filters,
    sortBy,
    sortDir,
    layout,
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ColumnsPopover
        columns={config.allColumns}
        visibleColumns={visibleColumns}
        columnOrder={columnOrder}
        onVisibilityChange={onColumnsChange}
        onOrderChange={onColumnOrderChange}
      />

      <FiltersPopover
        filterFields={config.supportedFilters}
        filters={filters}
        onFiltersChange={onFiltersChange}
        filterOptions={filterOptions}
      />

      <SavedViewsPopover
        reportType={config.id}
        currentState={currentState}
        onLoadView={onLoadView}
        savedViewsHook={savedViewsHook}
      />

      <div className="flex-1" />

      <ReportExportButtons
        reportType={config.id}
        supportedFormats={config.exportFormats}
        params={urlParams}
      />
    </div>
  );
}
