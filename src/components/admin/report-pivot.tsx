/**
 * Report Pivot
 * ============================================================================
 * Row x Column pivot table for matrix reports (e.g., PO Sold by Size).
 * Path: src/components/admin/report-pivot.tsx
 */

'use client';

import * as React from 'react';
import { cn, formatPrice } from '@/lib/utils';

interface POSoldRow {
  sku: string;
  description?: string;
  color?: string;
  [key: string]: unknown; // size columns: size2, size3, etc.
}

interface ReportPivotProps {
  data: POSoldRow[];
  rowField: string;
  rowLabelField?: string;
  columnFields: string[];
  columnLabels?: Record<string, string>;
  showRowTotals?: boolean;
  showColumnTotals?: boolean;
  valueFormatter?: (value: number) => string;
}

// Standard size columns for PO Sold report
const DEFAULT_SIZE_COLUMNS = [
  'size2', 'size3', 'size4', 'size5', 'size6', 'size7', 'size8',
  'size10', 'size12', 'size14', 'size16', 'sizeOS'
];

const DEFAULT_SIZE_LABELS: Record<string, string> = {
  size2: '2', size3: '3', size4: '4', size5: '5', size6: '6', size7: '7', size8: '8',
  size10: '10', size12: '12', size14: '14', size16: '16', sizeOS: 'O/S'
};

export function ReportPivot({
  data,
  rowField,
  rowLabelField,
  columnFields = DEFAULT_SIZE_COLUMNS,
  columnLabels = DEFAULT_SIZE_LABELS,
  showRowTotals = true,
  showColumnTotals = true,
  valueFormatter = (v) => v.toLocaleString(),
}: ReportPivotProps) {
  // Filter to only columns that have any data
  const activeColumns = React.useMemo(() => {
    return columnFields.filter((col) =>
      data.some((row) => {
        const val = row[col];
        return typeof val === 'number' && val > 0;
      })
    );
  }, [data, columnFields]);

  // Calculate row totals
  const rowTotals = React.useMemo(() => {
    return data.map((row) => {
      return activeColumns.reduce((sum, col) => {
        const val = row[col];
        return sum + (typeof val === 'number' ? val : 0);
      }, 0);
    });
  }, [data, activeColumns]);

  // Calculate column totals
  const columnTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    activeColumns.forEach((col) => {
      totals[col] = data.reduce((sum, row) => {
        const val = row[col];
        return sum + (typeof val === 'number' ? val : 0);
      }, 0);
    });
    return totals;
  }, [data, activeColumns]);

  // Grand total
  const grandTotal = React.useMemo(() => {
    return rowTotals.reduce((sum, val) => sum + val, 0);
  }, [rowTotals]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No data available
      </div>
    );
  }

  if (activeColumns.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No size data available
      </div>
    );
  }

  return (
    <div className="max-h-[500px] overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="bg-muted/90 backdrop-blur-sm">
            {/* Row identifier column - sticky left and top */}
            <th className="sticky left-0 z-30 bg-muted/90 backdrop-blur-sm px-3 py-2 text-left font-medium border-b border-r min-w-[200px]">
              SKU
            </th>
            {rowLabelField && (
              <th className="px-3 py-2 text-left font-medium border-b min-w-[150px]">
                Description
              </th>
            )}
            {/* Size columns */}
            {activeColumns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-center font-medium border-b min-w-[60px]"
              >
                {columnLabels[col] || col}
              </th>
            ))}
            {/* Row total column */}
            {showRowTotals && (
              <th className="px-3 py-2 text-center font-medium border-b border-l bg-muted/50 min-w-[80px]">
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => {
            const rowTotal = rowTotals[rowIdx];
            const hasAnyValue = rowTotal > 0;

            return (
              <tr
                key={row[rowField] as string}
                className={cn(
                  'hover:bg-muted/5',
                  !hasAnyValue && 'opacity-50'
                )}
              >
                {/* SKU column - sticky */}
                <td className="sticky left-0 z-10 bg-background px-3 py-2 font-mono text-xs border-b border-r">
                  {row[rowField] as string}
                </td>
                {rowLabelField && (
                  <td className="px-3 py-2 border-b truncate max-w-[200px]">
                    {(row[rowLabelField] as string) || '—'}
                  </td>
                )}
                {/* Size value cells */}
                {activeColumns.map((col) => {
                  const val = row[col];
                  const numVal = typeof val === 'number' ? val : 0;
                  return (
                    <td
                      key={col}
                      className={cn(
                        'px-3 py-2 text-center border-b tabular-nums',
                        numVal > 0 ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {numVal > 0 ? valueFormatter(numVal) : '—'}
                    </td>
                  );
                })}
                {/* Row total */}
                {showRowTotals && (
                  <td className="px-3 py-2 text-center font-medium border-b border-l bg-muted/10 tabular-nums">
                    {rowTotal > 0 ? valueFormatter(rowTotal) : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        {/* Column totals footer - sticky */}
        {showColumnTotals && (
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-muted/90 backdrop-blur-sm font-medium">
              <td className="sticky left-0 z-30 bg-muted/90 backdrop-blur-sm px-3 py-2 border-t border-r">
                Total
              </td>
              {rowLabelField && <td className="px-3 py-2 border-t" />}
              {activeColumns.map((col) => (
                <td key={col} className="px-3 py-2 text-center border-t tabular-nums">
                  {columnTotals[col] > 0 ? valueFormatter(columnTotals[col]) : '—'}
                </td>
              ))}
              {showRowTotals && (
                <td className="px-3 py-2 text-center border-t border-l bg-primary/10 tabular-nums">
                  {valueFormatter(grandTotal)}
                </td>
              )}
            </tr>
          </tfoot>
        )}
      </table>

      {/* Summary */}
      <div className="mt-4 flex justify-end gap-6 text-sm text-muted-foreground">
        <span>{data.length} SKUs</span>
        <span>{activeColumns.length} sizes</span>
        <span className="font-medium text-foreground">
          Grand Total: {valueFormatter(grandTotal)} units
        </span>
      </div>
    </div>
  );
}
