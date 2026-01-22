/**
 * Reports Page Client Component
 * ============================================================================
 * Main client component for the interactive reports page.
 * Path: src/components/admin/reports-page-client.tsx
 */

'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { ReportTypeSelector } from './report-type-selector';
import { ReportToolbar } from './report-toolbar';
import { ReportDataTable } from './report-data-table';
import { ReportGrouped } from './report-grouped';
import { ReportPivot } from './report-pivot';
import { CohortHeatmap } from './cohort-heatmap';
import { QuadrantChart } from './quadrant-chart';
import { FunnelChart, FirstToSecondFunnel } from './funnel-chart';
import { VelocityTable } from './velocity-table';
import { ScorecardTable } from './scorecard-table';
import { ExceptionTabs } from './exception-tabs';
import { Loader2 } from 'lucide-react';
import type {
  ReportType,
  FilterState,
  SavedView,
  LayoutMode,
} from '@/lib/types/report';
import { getReportConfig, REPORT_CONFIGS } from '@/lib/types/report';
import type { DateRange } from '@/components/ui/date-range-popover';

// ============================================================================
// Report Renderers Map
// ============================================================================

const REPORT_RENDERERS: Record<ReportType, string> = {
  'category-totals': 'grouped',
  'po-sold': 'pivot',
  'exception': 'exception-tabs',
  'cohort-retention': 'cohort-heatmap',
  'account-potential': 'quadrant',
  'sku-velocity': 'velocity',
  'rep-scorecard': 'scorecard',
  'customer-ltv': 'flat',
  'first-to-second': 'funnel',
};

function getStringField(row: Record<string, unknown>, key: string, fallback = ''): string {
  const v = row[key]
  return typeof v === 'string' ? v : v == null ? fallback : String(v)
}

function getNumberField(row: Record<string, unknown>, key: string, fallback = 0): number {
  const v = row[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function getNullableNumberField(row: Record<string, unknown>, key: string): number | null {
  const v = row[key]
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

// ============================================================================
// URL State Helpers
// ============================================================================

/**
 * Parse filters from URL - supports both new simple format and legacy JSON format
 * New format: field:op:value,field:op:value (pipe-separated for multi-value)
 * Legacy: URL-encoded JSON array
 */
function parseFiltersFromUrl(filtersParam: string | null): FilterState[] {
  if (!filtersParam) return [];
  
  // Check for legacy JSON format (starts with [ or encoded [)
  if (filtersParam.startsWith('%5B') || filtersParam.startsWith('[')) {
    try {
      return JSON.parse(decodeURIComponent(filtersParam));
    } catch {
      // Fall through to new format
    }
  }
  
  // New simple format: field:op:value,field:op:value
  try {
    const parsed: FilterState[] = [];
    for (const segment of filtersParam.split(',')) {
      const parts = segment.split(':');
      if (parts.length < 3) continue;
      
      const [fieldId, operator, ...valueParts] = parts;
      const rawValue = valueParts.join(':'); // Rejoin in case value contains colons
      const decodedValue = decodeURIComponent(rawValue);
      
      // Check for multi-value (pipe-separated)
      const value = decodedValue.includes('|') 
        ? decodedValue.split('|') 
        : decodedValue;
      
      parsed.push({
        fieldId,
        operator: operator as FilterState['operator'],
        value,
      });
    }
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Encode filters for URL using simple format
 * Format: field:op:value,field:op:value
 * Multi-values are pipe-separated: field:eq:value1|value2|value3
 */
function encodeFiltersForUrl(filters: FilterState[]): string {
  if (filters.length === 0) return '';
  
  return filters.map(f => {
    const value = Array.isArray(f.value) 
      ? f.value.map(v => encodeURIComponent(v)).join('|')
      : encodeURIComponent(f.value);
    return `${f.fieldId}:${f.operator}:${value}`;
  }).join(',');
}

function parseColumnsFromUrl(colsParam: string | null, allColumns: string[]): string[] {
  if (!colsParam) return allColumns;
  return colsParam.split(',').filter((c) => allColumns.includes(c));
}

function parseColumnOrderFromUrl(orderParam: string | null): string[] {
  if (!orderParam) return [];
  return orderParam.split(',');
}

// ============================================================================
// Report Data Fetching Hook
// ============================================================================

interface UseReportDataOptions {
  reportType: ReportType;
  filters: FilterState[];
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  dateRange: DateRange;
}

interface ReportDataResult<T> {
  data: T[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  filterOptions: Record<string, Array<{ value: string; label: string }>>;
}

function useReportData<T>({
  reportType,
  filters,
  sortBy,
  sortDir,
  page,
  pageSize,
  dateRange,
}: UseReportDataOptions): ReportDataResult<T> {
  const [data, setData] = React.useState<T[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filterOptions, setFilterOptions] = React.useState<
    Record<string, Array<{ value: string; label: string }>>
  >({});

  React.useEffect(() => {
    const controller = new AbortController();
    
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams({
          type: reportType,
          page: String(page),
          pageSize: String(pageSize),
        });
        
        if (sortBy) {
          params.set('sortBy', sortBy);
          params.set('sortDir', sortDir);
        }
        
        if (filters.length > 0) {
          params.set('filters', encodeFiltersForUrl(filters));
        }

        if (dateRange.from) {
          params.set('from', dateRange.from);
        }
        if (dateRange.to) {
          params.set('to', dateRange.to);
        }
        
        const response = await fetch(`/api/reports?${params.toString()}`, {
          signal: controller.signal,
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to fetch report data');
        }
        
        const result = await response.json();
        
        setData(result.data);
        setTotalCount(result.totalCount);
        if (result.filterOptions) {
          setFilterOptions(result.filterOptions);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
    
    return () => controller.abort();
  }, [reportType, filters, sortBy, sortDir, page, pageSize, dateRange]);

  return { data, totalCount, isLoading, error, filterOptions };
}

// ============================================================================
// Main Component
// ============================================================================

interface ReportsPageClientProps {
  initialType?: ReportType;
}

export function ReportsPageClient({ initialType }: ReportsPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse state from URL
  const reportType = (searchParams.get('type') as ReportType) || initialType || 'category-totals';
  const config = getReportConfig(reportType);
  
  const allColumnIds = config.allColumns.map((c) => c.id);
  const defaultVisibleIds = config.allColumns
    .filter((c) => c.defaultVisible)
    .map((c) => c.id);

  const visibleColumns = parseColumnsFromUrl(
    searchParams.get('cols'),
    defaultVisibleIds
  );
  const columnOrder = parseColumnOrderFromUrl(searchParams.get('order'));
  const filters = parseFiltersFromUrl(searchParams.get('filters'));
  const sortBy = searchParams.get('sortBy');
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc';
  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || 25;
  const layout = (searchParams.get('layout') as LayoutMode) || 'flat';
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');
  const dateRange: DateRange = React.useMemo(() => ({
    from: dateFrom,
    to: dateTo,
  }), [dateFrom, dateTo]);

  // Build URL update function
  const updateUrl = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Event handlers
  const handleTypeChange = (type: ReportType) => {
    // Reset to defaults for new report type
    const newConfig = getReportConfig(type);
    const newDefaultCols = newConfig.allColumns
      .filter((c) => c.defaultVisible)
      .map((c) => c.id);
    
    updateUrl({
      type,
      cols: null,
      order: null,
      filters: null,
      sortBy: null,
      sortDir: null,
      page: null,
      layout: null,
    });
  };

  const handleColumnsChange = (cols: string[]) => {
    updateUrl({
      cols: cols.join(','),
    });
  };

  const handleColumnOrderChange = (order: string[]) => {
    updateUrl({
      order: order.length > 0 ? order.join(',') : null,
    });
  };

  const handleFiltersChange = (newFilters: FilterState[]) => {
    updateUrl({
      filters: newFilters.length > 0 ? encodeFiltersForUrl(newFilters) : null,
      page: '1', // Reset to first page when filters change
    });
  };

  const handleSortChange = (columnId: string, direction: 'asc' | 'desc') => {
    updateUrl({
      sortBy: columnId,
      sortDir: direction,
    });
  };

  const handlePageChange = (newPage: number) => {
    updateUrl({
      page: String(newPage),
    });
  };

  const handleLoadView = (view: SavedView) => {
    updateUrl({
      type: view.reportType,
      cols: view.columns.join(','),
      order: view.columnOrder.length > 0 ? view.columnOrder.join(',') : null,
      filters:
        view.filters.length > 0 ? encodeFiltersForUrl(view.filters) : null,
      sortBy: view.sortBy,
      sortDir: view.sortDir,
      layout: view.layout,
      page: '1',
    });
  };

  const handleDateRangeChange = (range: DateRange) => {
    updateUrl({
      from: range.from,
      to: range.to,
      page: '1', // Reset to first page when date changes
    });
  };

  // Fetch data
  const { data, totalCount, isLoading, error, filterOptions } = useReportData<
    Record<string, unknown>
  >({
    reportType,
    filters,
    sortBy,
    sortDir,
    page,
    pageSize,
    dateRange,
  });

  // Build URL params for export
  const urlParams = React.useMemo(() => {
    const params: Record<string, string> = { type: reportType };
    if (visibleColumns.length > 0) params.cols = visibleColumns.join(',');
    if (columnOrder.length > 0) params.order = columnOrder.join(',');
    if (filters.length > 0) params.filters = encodeFiltersForUrl(filters);
    if (sortBy) params.sortBy = sortBy;
    if (sortDir) params.sortDir = sortDir;
    if (dateRange.from) params.from = dateRange.from;
    if (dateRange.to) params.to = dateRange.to;
    return params;
  }, [reportType, visibleColumns, columnOrder, filters, sortBy, sortDir, dateRange]);

  // Get row ID function based on report type
  const getRowId = React.useCallback(
    (row: Record<string, unknown>) => {
      switch (reportType) {
        case 'category-totals':
          return `${row.mainCategory}-${row.subCategory}`;
        case 'po-sold':
          return `${row.sku}-${row.categoryName}`;
        case 'sku-velocity':
          return String(row.sku);
        case 'customer-ltv':
        case 'account-potential':
          return String(row.customerId);
        case 'rep-scorecard':
          return String(row.repId);
        case 'cohort-retention':
        case 'first-to-second':
          return String(row.cohortMonth);
        case 'exception':
          return `${row.type}-${row.entityId}`;
        default:
          return String(Object.values(row)[0]);
      }
    },
    [reportType]
  );

  return (
    <div className="space-y-6">
      {/* Report Type Selector */}
      <ReportTypeSelector value={reportType} onChange={handleTypeChange} />

      {/* Report Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{config.name}</h2>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
      </div>

      {/* Toolbar */}
      <ReportToolbar
        config={config}
        visibleColumns={visibleColumns}
        columnOrder={columnOrder}
        filters={filters}
        sortBy={sortBy}
        sortDir={sortDir}
        layout={layout}
        filterOptions={filterOptions}
        dateRange={dateRange}
        onColumnsChange={handleColumnsChange}
        onColumnOrderChange={handleColumnOrderChange}
        onFiltersChange={handleFiltersChange}
        onDateRangeChange={handleDateRangeChange}
        onLoadView={handleLoadView}
        urlParams={urlParams}
      />

      {/* Data Quality Warning Banner */}
      {!isLoading && !error && data.length > 0 && config.id === 'exception' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">
            Data quality: 75% of orders matched to customers. Some analytics may be incomplete.
          </span>
        </div>
      )}

      {/* Report Visualization */}
      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => handlePageChange(1)}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground underline"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No data found for the current filters.
          </p>
        </div>
      ) : (
        // Render appropriate visualization based on report type
        <>
          {reportType === 'category-totals' && (
            <ReportGrouped
              data={data}
              groupByField="mainCategory"
              subGroupField="subCategory"
              columns={config.allColumns}
              visibleColumns={visibleColumns}
              aggregateFields={['quantity', 'skuCount']}
            />
          )}
          
          {reportType === 'po-sold' && (
            <ReportPivot
              data={data as Array<{ sku: string; [key: string]: unknown }>}
              rowField="sku"
              rowLabelField="categoryName"
              columnFields={['size2', 'size3', 'size4', 'size5', 'size6', 'size7', 'size8', 'size10', 'size12', 'size14', 'size16', 'sizeOS']}
            />
          )}
          
          {reportType === 'exception' && (
            <ExceptionTabs data={data as unknown as React.ComponentProps<typeof ExceptionTabs>['data']} />
          )}
          
          {reportType === 'cohort-retention' && (
            <CohortHeatmap
              data={data.map((row) => ({
                cohort: getStringField(row, 'cohortMonth'),
                customerCount: getNumberField(row, 'size'),
                m1: getNullableNumberField(row, 'm1'),
                m2: getNullableNumberField(row, 'm2'),
                m3: getNullableNumberField(row, 'm3'),
                m6: getNullableNumberField(row, 'm6'),
                m12: getNullableNumberField(row, 'm12'),
                ltv: getNumberField(row, 'ltv'),
              }))}
            />
          )}
          
          {reportType === 'account-potential' && (
            <QuadrantChart
              data={data.map((row) => ({
                id: getStringField(row, 'customerId'),
                storeName: getStringField(row, 'storeName'),
                currentRevenue: getNumberField(row, 'currentRevenue'),
                estimatedPotential: getNumberField(row, 'estimatedPotential'),
                segment: getStringField(row, 'segment'),
                rep: getStringField(row, 'rep'),
              }))}
            />
          )}
          
          {reportType === 'sku-velocity' && (
            <VelocityTable
              data={data.map((row) => ({
                sku: getStringField(row, 'sku'),
                description: getStringField(row, 'description', getStringField(row, 'sku')),
                category: getStringField(row, 'category'),
                currentStock: getNumberField(row, 'currentStock', 0),
                avgDailySales: getNumberField(row, 'avgDailySales', 0),
                daysOfStock: getNumberField(row, 'daysOfStock', 999),
                last30dSales: getNumberField(row, 'last30dSales', 0),
                last30dTrend: getNumberField(row, 'last30dTrend', 0),
                healthScore: getStringField(row, 'healthScore', 'monitor') as 'reorder-now' | 'reorder-soon' | 'monitor' | 'overstock' | 'discontinue',
                recommendedAction: getStringField(row, 'recommendedAction', ''),
              }))}
            />
          )}
          
          {reportType === 'rep-scorecard' && (
            <ScorecardTable
              data={data.map((row) => {
                const history = row.revenueHistory
                const revenueHistory = Array.isArray(history)
                  ? history.map((v) => (typeof v === 'number' ? v : Number(v))).filter((n) => Number.isFinite(n))
                  : []

                return {
                  repId: getNumberField(row, 'repId'),
                  repName: getStringField(row, 'repName'),
                  territory: getStringField(row, 'territory', ''),
                  revenue: getNumberField(row, 'revenue'),
                  revenueRank: getNumberField(row, 'revenueRank'),
                  targetAmount: getNumberField(row, 'targetAmount'),
                  targetPercent: getNumberField(row, 'percentOfTarget') * 100,
                  targetRank: getNumberField(row, 'targetRank'),
                  shareOfPotential: getNumberField(row, 'shareOfPotential'),
                  potentialRank: getNumberField(row, 'potentialRank'),
                  orderCount: getNumberField(row, 'orderCount', 0),
                  customerCount: getNumberField(row, 'activeAccounts', 0),
                  revenueHistory,
                }
              })}
            />
          )}
          
          {reportType === 'customer-ltv' && (
            <ReportDataTable
              data={data}
              columnDefs={config.allColumns}
              visibleColumns={visibleColumns}
              columnOrder={columnOrder}
              getRowId={getRowId}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={handleSortChange}
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={handlePageChange}
            />
          )}
          
          {reportType === 'first-to-second' && (
            <FirstToSecondFunnel
              data={{
                newCustomers: data.reduce((sum, row) => sum + getNumberField(row, 'newCustomers', 0), 0),
                converted30d: data.reduce((sum, row) => {
                  const newCustomers = getNumberField(row, 'newCustomers', 0)
                  const conversionRate = getNumberField(row, 'conversionRate', 0)
                  return sum + Math.round(newCustomers * conversionRate * 0.4)
                }, 0),
                converted60d: data.reduce((sum, row) => {
                  const newCustomers = getNumberField(row, 'newCustomers', 0)
                  const conversionRate = getNumberField(row, 'conversionRate', 0)
                  return sum + Math.round(newCustomers * conversionRate * 0.7)
                }, 0),
                converted90d: data.reduce((sum, row) => sum + getNumberField(row, 'convertedCustomers', 0), 0),
              }}
            />
          )}
        </>
      )}

      {/* Summary Row */}
      {!isLoading && !error && data.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {Math.min(data.length, pageSize)} of {totalCount.toLocaleString()} records
          </span>
          <span>Report: {config.name}</span>
        </div>
      )}
    </div>
  );
}
