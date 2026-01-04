/**
 * Empty Report State
 * ============================================================================
 * Informative empty state for schema-dependent reports.
 * Path: src/components/admin/empty-report-state.tsx
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyReportStateProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}

export function EmptyReportState({ 
  title, 
  description, 
  icon, 
  children 
}: EmptyReportStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">{icon}</div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-md mb-8">{description}</p>
      {children && <div className="opacity-30 w-full max-w-lg">{children}</div>}
    </div>
  );
}

// ============================================================================
// Skeleton Placeholders for specific report types
// ============================================================================

/**
 * Cohort Heatmap Skeleton - shows grayed out grid structure
 */
export function CohortHeatmapSkeleton() {
  const columns = ['M1', 'M2', 'M3', 'M6', 'M12'];
  const rows = ['Jan 2025', 'Dec 2024', 'Nov 2024'];

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium">Cohort</th>
            <th className="px-3 py-2 text-right font-medium">Customers</th>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-center font-medium min-w-[60px]">
                {col}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">LTV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row} className="border-b">
              <td className="px-3 py-2 font-medium">{row}</td>
              <td className="px-3 py-2 text-right">—</td>
              {columns.map((col) => (
                <td key={col} className="px-1 py-1">
                  <div className="px-2 py-1 text-center rounded bg-muted">—</div>
                </td>
              ))}
              <td className="px-3 py-2 text-right">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Quadrant Chart Skeleton - shows empty quadrant with labeled axes
 */
export function QuadrantChartSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto">
      <svg viewBox="0 0 300 250" className="w-full h-auto">
        {/* Quadrant backgrounds */}
        <rect x="150" y="20" width="130" height="90" className="fill-green-100/50 dark:fill-green-900/20" />
        <rect x="20" y="20" width="130" height="90" className="fill-blue-100/50 dark:fill-blue-900/20" />
        <rect x="150" y="110" width="130" height="90" className="fill-amber-100/50 dark:fill-amber-900/20" />
        <rect x="20" y="110" width="130" height="90" className="fill-gray-100/50 dark:fill-gray-800/20" />

        {/* Quadrant dividers */}
        <line x1="150" y1="20" x2="150" y2="200" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4,4" />
        <line x1="20" y1="110" x2="280" y2="110" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4,4" />

        {/* Axes */}
        <line x1="20" y1="200" x2="280" y2="200" stroke="currentColor" />
        <line x1="20" y1="20" x2="20" y2="200" stroke="currentColor" />

        {/* Quadrant labels */}
        <text x="215" y="40" className="fill-green-600 text-[10px] font-medium">Stars</text>
        <text x="50" y="40" className="fill-blue-600 text-[10px] font-medium">Develop</text>
        <text x="215" y="190" className="fill-amber-600 text-[10px] font-medium">Harvest</text>
        <text x="50" y="190" className="fill-gray-500 text-[10px] font-medium">Maintain</text>

        {/* Axis labels */}
        <text x="150" y="230" textAnchor="middle" className="fill-muted-foreground text-[9px]">
          Current Revenue →
        </text>
        <text x="8" y="110" textAnchor="middle" className="fill-muted-foreground text-[9px]" transform="rotate(-90, 8, 110)">
          Potential →
        </text>
      </svg>
    </div>
  );
}

/**
 * Funnel Chart Skeleton - shows funnel shape with stage labels
 */
export function FunnelChartSkeleton() {
  const stages = [
    { name: 'First Order', width: '100%' },
    { name: '30-Day Return', width: '60%' },
    { name: '60-Day Return', width: '40%' },
    { name: '90-Day Return', width: '25%' },
  ];

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      {stages.map((stage, index) => (
        <div key={stage.name} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{stage.name}</span>
            <span className="text-muted-foreground">—</span>
          </div>
          <div className="relative">
            <div
              className={cn(
                'h-10 rounded-md bg-primary/20 flex items-center justify-center'
              )}
              style={{
                width: stage.width,
                marginLeft: `${(100 - parseInt(stage.width)) / 2}%`,
                clipPath: index === stages.length - 1
                  ? 'polygon(5% 0%, 95% 0%, 95% 100%, 5% 100%)'
                  : 'polygon(0% 0%, 100% 0%, 95% 100%, 5% 100%)',
              }}
            >
              <span className="text-sm text-muted-foreground">—</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
