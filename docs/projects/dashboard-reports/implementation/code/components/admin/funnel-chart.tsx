/**
 * Funnel Chart
 * ============================================================================
 * Conversion funnel visualization for First-to-Second analysis.
 * Path: src/components/admin/funnel-chart.tsx
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface FunnelStage {
  name: string;
  count: number;
  rate: number; // 0-1, conversion rate from first stage
  color?: string;
}

interface FunnelChartProps {
  stages: FunnelStage[];
  title?: string;
  showPercentages?: boolean;
}

const DEFAULT_COLORS = [
  'bg-primary',
  'bg-primary/80',
  'bg-primary/60',
  'bg-primary/40',
  'bg-primary/20',
];

export function FunnelChart({
  stages,
  title,
  showPercentages = true,
}: FunnelChartProps) {
  if (stages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No funnel data available
      </div>
    );
  }

  const maxCount = Math.max(...stages.map((s) => s.count));

  return (
    <div className="space-y-6">
      {title && <h3 className="text-lg font-semibold">{title}</h3>}

      <div className="space-y-3">
        {stages.map((stage, index) => {
          const widthPercent = (stage.count / maxCount) * 100;
          const color = stage.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
          const dropoff = index > 0 ? stages[index - 1].count - stage.count : 0;
          const dropoffRate = index > 0 ? dropoff / stages[index - 1].count : 0;

          return (
            <div key={stage.name} className="space-y-1">
              {/* Stage label */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{stage.name}</span>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{stage.count.toLocaleString()}</span>
                  {showPercentages && (
                    <span className="text-muted-foreground tabular-nums w-16 text-right">
                      {(stage.rate * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Funnel bar */}
              <div className="relative">
                <div
                  className="h-10 rounded-md transition-all duration-300 flex items-center justify-center"
                  style={{
                    width: `${widthPercent}%`,
                    marginLeft: `${(100 - widthPercent) / 2}%`,
                  }}
                >
                  {/* Trapezoid effect using clip-path */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded-md',
                      color
                    )}
                    style={{
                      clipPath: index === stages.length - 1
                        ? 'polygon(5% 0%, 95% 0%, 95% 100%, 5% 100%)'
                        : 'polygon(0% 0%, 100% 0%, 95% 100%, 5% 100%)',
                    }}
                  />
                  <span className="relative z-10 text-primary-foreground font-medium text-sm">
                    {stage.count.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Dropoff indicator */}
              {index > 0 && dropoff > 0 && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className="text-red-500">-{dropoff.toLocaleString()}</span>
                  <span>({(dropoffRate * 100).toFixed(1)}% drop)</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t">
        <div className="text-center">
          <div className="text-2xl font-bold">{stages[0]?.count.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Started</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stages[stages.length - 1]?.count.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Converted</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {((stages[stages.length - 1]?.rate || 0) * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground">Overall Rate</div>
        </div>
      </div>
    </div>
  );
}

// Helper component for First-to-Second specific view
interface FirstToSecondData {
  newCustomers: number;
  converted30d: number;
  converted60d: number;
  converted90d: number;
}

export function FirstToSecondFunnel({ data }: { data: FirstToSecondData }) {
  const stages: FunnelStage[] = [
    {
      name: 'New Customers',
      count: data.newCustomers,
      rate: 1,
    },
    {
      name: 'Converted (30 days)',
      count: data.converted30d,
      rate: data.newCustomers > 0 ? data.converted30d / data.newCustomers : 0,
    },
    {
      name: 'Converted (60 days)',
      count: data.converted60d,
      rate: data.newCustomers > 0 ? data.converted60d / data.newCustomers : 0,
    },
    {
      name: 'Converted (90 days)',
      count: data.converted90d,
      rate: data.newCustomers > 0 ? data.converted90d / data.newCustomers : 0,
    },
  ];

  return <FunnelChart stages={stages} title="First-to-Second Order Conversion" />;
}
