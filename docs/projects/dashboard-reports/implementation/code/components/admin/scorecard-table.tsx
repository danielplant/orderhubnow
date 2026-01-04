/**
 * Scorecard Table
 * ============================================================================
 * Rep performance table with sparkline trends.
 * Path: src/components/admin/scorecard-table.tsx
 */

'use client';

import * as React from 'react';
import { cn, formatPrice } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScorecardRow {
  repId: number;
  repName: string;
  territory?: string;
  revenue: number;
  revenueRank: number;
  targetAmount: number;
  targetPercent: number;
  targetRank: number;
  shareOfPotential: number;
  potentialRank: number;
  orderCount: number;
  customerCount: number;
  revenueHistory: number[]; // Last 6 months for sparkline
}

interface ScorecardTableProps {
  data: ScorecardRow[];
  onRepClick?: (repId: number) => void;
}

// Inline SVG Sparkline component
function Sparkline({ values, width = 80, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const padding = 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  // Determine trend color
  const trend = values[values.length - 1] - values[0];
  const strokeColor = trend > 0 ? 'stroke-green-500' : trend < 0 ? 'stroke-red-500' : 'stroke-gray-400';

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        className={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={padding + (width - padding * 2)}
        cy={padding + (1 - (values[values.length - 1] - min) / range) * (height - padding * 2)}
        r="3"
        className={cn('fill-current', trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-gray-400')}
      />
    </svg>
  );
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  const isTop3 = rank <= 3;
  const isBottom3 = rank > total - 3;

  return (
    <span className={cn(
      'inline-flex items-center justify-center w-8 h-6 rounded text-xs font-medium',
      isTop3 && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      isBottom3 && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      !isTop3 && !isBottom3 && 'bg-muted text-muted-foreground'
    )}>
      #{rank}
    </span>
  );
}

function TargetProgress({ percent }: { percent: number }) {
  const isOnTrack = percent >= 100;
  const isClose = percent >= 80 && percent < 100;

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isOnTrack && 'bg-green-500',
            isClose && 'bg-amber-500',
            !isOnTrack && !isClose && 'bg-red-500'
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className={cn(
        'text-xs tabular-nums font-medium',
        isOnTrack && 'text-green-600',
        isClose && 'text-amber-600',
        !isOnTrack && !isClose && 'text-red-600'
      )}>
        {percent.toFixed(0)}%
      </span>
    </div>
  );
}

export function ScorecardTable({ data, onRepClick }: ScorecardTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No rep data available
      </div>
    );
  }

  const totalReps = data.length;

  // Summary stats
  const totalRevenue = data.reduce((sum, r) => sum + r.revenue, 0);
  const avgTargetPercent = data.reduce((sum, r) => sum + r.targetPercent, 0) / data.length;
  const onTrackCount = data.filter((r) => r.targetPercent >= 100).length;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-bold">{formatPrice(totalRevenue)}</div>
          <div className="text-xs text-muted-foreground">Total Revenue</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-bold">{totalReps}</div>
          <div className="text-xs text-muted-foreground">Active Reps</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className={cn(
            'text-2xl font-bold',
            avgTargetPercent >= 100 ? 'text-green-600' : 'text-amber-600'
          )}>
            {avgTargetPercent.toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground">Avg Target</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-2xl font-bold text-green-600">{onTrackCount}</div>
          <div className="text-xs text-muted-foreground">On Track</div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Rep</th>
              <th className="px-3 py-2 text-left font-medium">Territory</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-center font-medium">Rev Rank</th>
              <th className="px-3 py-2 text-center font-medium">% Target</th>
              <th className="px-3 py-2 text-center font-medium">Tgt Rank</th>
              <th className="px-3 py-2 text-right font-medium">Share of Pot.</th>
              <th className="px-3 py-2 text-center font-medium">Pot Rank</th>
              <th className="px-3 py-2 text-center font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.repId}
                className={cn(
                  'border-t hover:bg-muted/5',
                  onRepClick && 'cursor-pointer'
                )}
                onClick={() => onRepClick?.(row.repId)}
              >
                <td className="px-3 py-2 font-medium">{row.repName}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.territory || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {formatPrice(row.revenue)}
                </td>
                <td className="px-3 py-2 text-center">
                  <RankBadge rank={row.revenueRank} total={totalReps} />
                </td>
                <td className="px-3 py-2">
                  <TargetProgress percent={row.targetPercent} />
                </td>
                <td className="px-3 py-2 text-center">
                  <RankBadge rank={row.targetRank} total={totalReps} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(row.shareOfPotential * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-center">
                  <RankBadge rank={row.potentialRank} total={totalReps} />
                </td>
                <td className="px-3 py-2 text-center">
                  <Sparkline values={row.revenueHistory} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Ranking:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/30" />
          <span>Top 3</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-muted" />
          <span>Middle</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-900/30" />
          <span>Bottom 3</span>
        </div>
      </div>
    </div>
  );
}
