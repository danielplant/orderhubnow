/**
 * Cohort Heatmap
 * ============================================================================
 * Color-coded retention grid for cohort analysis.
 * Path: src/components/admin/cohort-heatmap.tsx
 */

'use client';

import * as React from 'react';
import { Users } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { EmptyReportState, CohortHeatmapSkeleton } from './empty-report-state';

interface CohortRow {
  cohort: string; // "2024-01" format
  cohortLabel?: string; // "Jan 2024" display format
  customerCount: number;
  m1: number | null; // Month 1 retention %
  m2: number | null;
  m3: number | null;
  m6: number | null;
  m12: number | null;
  ltv: number;
}

interface CohortHeatmapProps {
  data: CohortRow[];
  colorThresholds?: {
    green: number; // Default 0.6 (60%)
    yellow: number; // Default 0.4 (40%)
  };
}

const DEFAULT_THRESHOLDS = {
  green: 0.6,
  yellow: 0.4,
};

const RETENTION_COLUMNS = ['m1', 'm2', 'm3', 'm6', 'm12'] as const;
const COLUMN_LABELS: Record<string, string> = {
  m1: 'M1',
  m2: 'M2',
  m3: 'M3',
  m6: 'M6',
  m12: 'M12',
};

function formatCohortLabel(cohort: string): string {
  // Convert "2024-01" to "Jan 2024"
  const [year, month] = cohort.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getRetentionColor(value: number | null, thresholds: typeof DEFAULT_THRESHOLDS): string {
  if (value === null) return 'bg-gray-100 dark:bg-gray-800';
  
  if (value >= thresholds.green) {
    return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200';
  }
  if (value >= thresholds.yellow) {
    return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200';
  }
  return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200';
}

function formatRetention(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(0)}%`;
}

export function CohortHeatmap({
  data,
  colorThresholds = DEFAULT_THRESHOLDS,
}: CohortHeatmapProps) {
  // Calculate averages for footer
  const averages = React.useMemo(() => {
    const result: Record<string, number | null> = {};

    RETENTION_COLUMNS.forEach((col) => {
      const values = data
        .map((row) => row[col])
        .filter((v): v is number => v !== null);

      if (values.length === 0) {
        result[col] = null;
      } else {
        result[col] = values.reduce((sum, v) => sum + v, 0) / values.length;
      }
    });

    return result;
  }, [data]);

  if (data.length === 0) {
    return (
      <EmptyReportState
        title="Cohort Retention Analysis"
        description="Track how customer cohorts retain over time. This report shows the percentage of customers from each monthly cohort who return to place subsequent orders."
        icon={<Users className="h-8 w-8 text-muted-foreground" />}
      >
        <CohortHeatmapSkeleton />
      </EmptyReportState>
    );
  }

  const totalLTV = data.reduce((sum, row) => sum + row.ltv, 0);
  const avgLTV = data.length > 0 ? totalLTV / data.length : 0;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Cohort</th>
              <th className="px-3 py-2 text-right font-medium">Customers</th>
              {RETENTION_COLUMNS.map((col) => (
                <th key={col} className="px-3 py-2 text-center font-medium min-w-[60px]">
                  {COLUMN_LABELS[col]}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">LTV</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.cohort} className="border-b hover:bg-muted/5">
                <td className="px-3 py-2 font-medium">
                  {row.cohortLabel || formatCohortLabel(row.cohort)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.customerCount.toLocaleString()}
                </td>
                {RETENTION_COLUMNS.map((col) => (
                  <td key={col} className="px-1 py-1">
                    <div
                      className={cn(
                        'px-2 py-1 text-center rounded font-medium tabular-nums',
                        getRetentionColor(row[col], colorThresholds)
                      )}
                    >
                      {formatRetention(row[col])}
                    </div>
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {formatPrice(row.ltv)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-medium">
              <td className="px-3 py-2">Average</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {Math.round(data.reduce((sum, r) => sum + r.customerCount, 0) / data.length).toLocaleString()}
              </td>
              {RETENTION_COLUMNS.map((col) => (
                <td key={col} className="px-1 py-1">
                  <div
                    className={cn(
                      'px-2 py-1 text-center rounded font-medium tabular-nums',
                      getRetentionColor(averages[col], colorThresholds)
                    )}
                  >
                    {formatRetention(averages[col])}
                  </div>
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">
                {formatPrice(avgLTV)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Retention:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/30" />
          <span>&gt;{(colorThresholds.green * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-amber-100 dark:bg-amber-900/30" />
          <span>{(colorThresholds.yellow * 100).toFixed(0)}-{(colorThresholds.green * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-900/30" />
          <span>&lt;{(colorThresholds.yellow * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
