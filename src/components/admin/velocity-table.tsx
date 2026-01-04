/**
 * Velocity Table
 * ============================================================================
 * Color-coded SKU velocity table with health score badges.
 * Path: src/components/admin/velocity-table.tsx
 */

'use client';

import * as React from 'react';
import { cn, formatPrice } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus, AlertTriangle, Package, TrendingDown, RotateCcw, Archive } from 'lucide-react';

type HealthScore = 'reorder-now' | 'reorder-soon' | 'monitor' | 'overstock' | 'discontinue';

interface VelocityRow {
  sku: string;
  description: string;
  category?: string;
  currentStock: number;
  avgDailySales: number;
  daysOfStock: number;
  last30dSales: number;
  last30dTrend: number; // -1 to 1, negative = declining
  healthScore: HealthScore;
  recommendedAction: string;
}

interface VelocityTableProps {
  data: VelocityRow[];
  onSkuClick?: (sku: string) => void;
}

const HEALTH_BADGES: Record<HealthScore, { label: string; className: string; icon: React.ElementType }> = {
  'reorder-now': {
    label: 'Reorder Now',
    className: 'bg-red-500 text-white',
    icon: AlertTriangle,
  },
  'reorder-soon': {
    label: 'Reorder Soon',
    className: 'bg-amber-400 text-black',
    icon: RotateCcw,
  },
  'monitor': {
    label: 'Monitor',
    className: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    icon: Package,
  },
  'overstock': {
    label: 'Overstock',
    className: 'bg-blue-400 text-white',
    icon: Archive,
  },
  'discontinue': {
    label: 'Discontinue',
    className: 'bg-gray-700 text-white',
    icon: TrendingDown,
  },
};

const HEALTH_PRIORITY: Record<HealthScore, number> = {
  'reorder-now': 1,
  'reorder-soon': 2,
  'overstock': 3,
  'discontinue': 4,
  'monitor': 5,
};

function TrendIndicator({ value }: { value: number }) {
  if (value > 0.1) {
    return <ArrowUp className="h-4 w-4 text-green-500" />;
  }
  if (value < -0.1) {
    return <ArrowDown className="h-4 w-4 text-red-500" />;
  }
  return <Minus className="h-4 w-4 text-gray-400" />;
}

export function VelocityTable({ data, onSkuClick }: VelocityTableProps) {
  const [sortBy, setSortBy] = React.useState<'healthScore' | 'daysOfStock' | 'last30dSales'>('healthScore');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const sortedData = React.useMemo(() => {
    return [...data].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'healthScore':
          comparison = HEALTH_PRIORITY[a.healthScore] - HEALTH_PRIORITY[b.healthScore];
          break;
        case 'daysOfStock':
          comparison = a.daysOfStock - b.daysOfStock;
          break;
        case 'last30dSales':
          comparison = a.last30dSales - b.last30dSales;
          break;
      }
      
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [data, sortBy, sortDir]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No velocity data available
      </div>
    );
  }

  // Summary stats
  const stats = {
    reorderNow: data.filter((d) => d.healthScore === 'reorder-now').length,
    reorderSoon: data.filter((d) => d.healthScore === 'reorder-soon').length,
    overstock: data.filter((d) => d.healthScore === 'overstock').length,
    discontinue: data.filter((d) => d.healthScore === 'discontinue').length,
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/20">
          <div className="text-2xl font-bold text-red-600">{stats.reorderNow}</div>
          <div className="text-xs text-red-600/80">Reorder Now</div>
        </div>
        <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-950/20">
          <div className="text-2xl font-bold text-amber-600">{stats.reorderSoon}</div>
          <div className="text-xs text-amber-600/80">Reorder Soon</div>
        </div>
        <div className="rounded-lg border p-3 bg-blue-50 dark:bg-blue-950/20">
          <div className="text-2xl font-bold text-blue-600">{stats.overstock}</div>
          <div className="text-xs text-blue-600/80">Overstock</div>
        </div>
        <div className="rounded-lg border p-3 bg-gray-100 dark:bg-gray-800">
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-300">{stats.discontinue}</div>
          <div className="text-xs text-gray-500">Discontinue</div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th 
                className="px-3 py-2 text-right font-medium cursor-pointer hover:bg-muted/70"
                onClick={() => handleSort('healthScore')}
              >
                Status {sortBy === 'healthScore' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 text-right font-medium">Stock</th>
              <th 
                className="px-3 py-2 text-right font-medium cursor-pointer hover:bg-muted/70"
                onClick={() => handleSort('daysOfStock')}
              >
                Days Left {sortBy === 'daysOfStock' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className="px-3 py-2 text-right font-medium cursor-pointer hover:bg-muted/70"
                onClick={() => handleSort('last30dSales')}
              >
                30d Sales {sortBy === 'last30dSales' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 text-center font-medium">Trend</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row) => {
              const badge = HEALTH_BADGES[row.healthScore];
              const Icon = badge.icon;

              return (
                <tr
                  key={row.sku}
                  className={cn(
                    'border-t hover:bg-muted/5',
                    onSkuClick && 'cursor-pointer'
                  )}
                  onClick={() => onSkuClick?.(row.sku)}
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.sku}</td>
                  <td className="px-3 py-2 truncate max-w-[200px]">{row.description}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                      badge.className
                    )}>
                      <Icon className="h-3 w-3" />
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.currentStock.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={cn(
                      row.daysOfStock < 7 && row.daysOfStock !== 0 && 'text-red-600 font-medium',
                      row.daysOfStock < 14 && row.daysOfStock >= 7 && 'text-amber-600',
                      row.daysOfStock > 90 && row.daysOfStock < 999 && 'text-blue-600'
                    )}>
                      {row.daysOfStock === Infinity || row.daysOfStock >= 999 ? '—' : 
                       row.healthScore === 'discontinue' && row.currentStock === 0 ? '—' :
                       row.daysOfStock}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.last30dSales.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    <TrendIndicator value={row.last30dTrend} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.recommendedAction}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
