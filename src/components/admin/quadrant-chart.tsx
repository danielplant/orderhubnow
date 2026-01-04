/**
 * Quadrant Chart
 * ============================================================================
 * 2x2 scatter plot for Account Potential analysis.
 * Quadrants: Stars (top-right), Develop (top-left), Harvest (bottom-right), Maintain (bottom-left)
 * Path: src/components/admin/quadrant-chart.tsx
 */

'use client';

import * as React from 'react';
import { Target } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { EmptyReportState, QuadrantChartSkeleton } from './empty-report-state';

interface AccountPoint {
  id: string;
  storeName: string;
  currentRevenue: number;
  estimatedPotential: number;
  segment?: string;
  rep?: string;
}

interface QuadrantChartProps {
  data: AccountPoint[];
  onPointClick?: (account: AccountPoint) => void;
}

const QUADRANT_COLORS = {
  stars: 'fill-green-500',
  develop: 'fill-blue-500',
  harvest: 'fill-amber-500',
  maintain: 'fill-gray-400',
};

const QUADRANT_LABELS = {
  stars: { label: 'Stars', description: 'High value, high potential' },
  develop: { label: 'Develop', description: 'Low value, high potential' },
  harvest: { label: 'Harvest', description: 'High value, low potential' },
  maintain: { label: 'Maintain', description: 'Low value, low potential' },
};

export function QuadrantChart({ data, onPointClick }: QuadrantChartProps) {
  const [hoveredPoint, setHoveredPoint] = React.useState<AccountPoint | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState({ x: 0, y: 0 });

  // Filter out invalid data
  const validData = data.filter(
    (d) => d.currentRevenue > 0 || d.estimatedPotential > 0
  );

  if (validData.length === 0) {
    return (
      <EmptyReportState
        title="Account Potential Analysis"
        description="Visualize accounts by their current revenue vs estimated potential. Identify which accounts to develop, harvest, or maintain based on their growth opportunity."
        icon={<Target className="h-8 w-8 text-muted-foreground" />}
      >
        <QuadrantChartSkeleton />
      </EmptyReportState>
    );
  }

  // Calculate medians for quadrant lines
  const revenueValues = validData.map((d) => d.currentRevenue).sort((a, b) => a - b);
  const potentialValues = validData.map((d) => d.estimatedPotential).sort((a, b) => a - b);

  const medianRevenue = revenueValues[Math.floor(revenueValues.length / 2)];
  const medianPotential = potentialValues[Math.floor(potentialValues.length / 2)];

  // Calculate chart bounds with padding
  const maxRevenue = Math.max(...revenueValues) * 1.1;
  const maxPotential = Math.max(...potentialValues) * 1.1;

  // SVG dimensions
  const width = 600;
  const height = 400;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Scale functions
  const scaleX = (value: number) => padding.left + (value / maxRevenue) * chartWidth;
  const scaleY = (value: number) => padding.top + chartHeight - (value / maxPotential) * chartHeight;

  // Quadrant line positions
  const medianX = scaleX(medianRevenue);
  const medianY = scaleY(medianPotential);

  // Determine quadrant for a point
  const getQuadrant = (point: AccountPoint): keyof typeof QUADRANT_COLORS => {
    const isHighRevenue = point.currentRevenue >= medianRevenue;
    const isHighPotential = point.estimatedPotential >= medianPotential;

    if (isHighRevenue && isHighPotential) return 'stars';
    if (!isHighRevenue && isHighPotential) return 'develop';
    if (isHighRevenue && !isHighPotential) return 'harvest';
    return 'maintain';
  };

  // Count by quadrant
  const quadrantCounts = validData.reduce(
    (acc, point) => {
      const quadrant = getQuadrant(point);
      acc[quadrant]++;
      return acc;
    },
    { stars: 0, develop: 0, harvest: 0, maintain: 0 }
  );

  const handleMouseMove = (e: React.MouseEvent, point: AccountPoint) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setHoveredPoint(point);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <svg width={width} height={height} className="w-full h-auto">
          {/* Quadrant backgrounds */}
          <rect
            x={medianX}
            y={padding.top}
            width={chartWidth - (medianX - padding.left)}
            height={medianY - padding.top}
            className="fill-green-50 dark:fill-green-950/20"
          />
          <rect
            x={padding.left}
            y={padding.top}
            width={medianX - padding.left}
            height={medianY - padding.top}
            className="fill-blue-50 dark:fill-blue-950/20"
          />
          <rect
            x={medianX}
            y={medianY}
            width={chartWidth - (medianX - padding.left)}
            height={chartHeight - (medianY - padding.top)}
            className="fill-amber-50 dark:fill-amber-950/20"
          />
          <rect
            x={padding.left}
            y={medianY}
            width={medianX - padding.left}
            height={chartHeight - (medianY - padding.top)}
            className="fill-gray-50 dark:fill-gray-900/20"
          />

          {/* Quadrant lines */}
          <line
            x1={medianX}
            y1={padding.top}
            x2={medianX}
            y2={padding.top + chartHeight}
            className="stroke-muted-foreground/30"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          <line
            x1={padding.left}
            y1={medianY}
            x2={padding.left + chartWidth}
            y2={medianY}
            className="stroke-muted-foreground/30"
            strokeWidth="1"
            strokeDasharray="4,4"
          />

          {/* Axes */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight}
            className="stroke-foreground"
            strokeWidth="1"
          />
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + chartHeight}
            className="stroke-foreground"
            strokeWidth="1"
          />

          {/* Axis labels */}
          <text
            x={padding.left + chartWidth / 2}
            y={height - 5}
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            Current Revenue
          </text>
          <text
            x={15}
            y={padding.top + chartHeight / 2}
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
            transform={`rotate(-90, 15, ${padding.top + chartHeight / 2})`}
          >
            Estimated Potential
          </text>

          {/* Quadrant labels */}
          <text x={medianX + 10} y={padding.top + 20} className="fill-green-600 text-xs font-medium">
            Stars ({quadrantCounts.stars})
          </text>
          <text x={padding.left + 10} y={padding.top + 20} className="fill-blue-600 text-xs font-medium">
            Develop ({quadrantCounts.develop})
          </text>
          <text x={medianX + 10} y={padding.top + chartHeight - 10} className="fill-amber-600 text-xs font-medium">
            Harvest ({quadrantCounts.harvest})
          </text>
          <text x={padding.left + 10} y={padding.top + chartHeight - 10} className="fill-gray-500 text-xs font-medium">
            Maintain ({quadrantCounts.maintain})
          </text>

          {/* Data points */}
          {validData.map((point) => {
            const quadrant = getQuadrant(point);
            const cx = scaleX(point.currentRevenue);
            const cy = scaleY(point.estimatedPotential);

            return (
              <circle
                key={point.id}
                cx={cx}
                cy={cy}
                r={6}
                className={cn(
                  QUADRANT_COLORS[quadrant],
                  'stroke-background stroke-2 cursor-pointer transition-all',
                  hoveredPoint?.id === point.id && 'r-8'
                )}
                onMouseMove={(e) => handleMouseMove(e, point)}
                onMouseLeave={() => setHoveredPoint(null)}
                onClick={() => onPointClick?.(point)}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute z-10 bg-popover border rounded-lg shadow-lg p-3 text-sm pointer-events-none"
            style={{
              left: tooltipPos.x + 10,
              top: tooltipPos.y - 10,
              transform: 'translateY(-100%)',
            }}
          >
            <div className="font-medium">{hoveredPoint.storeName}</div>
            <div className="text-muted-foreground">
              Revenue: {formatPrice(hoveredPoint.currentRevenue)}
            </div>
            <div className="text-muted-foreground">
              Potential: {formatPrice(hoveredPoint.estimatedPotential)}
            </div>
            <div className="text-muted-foreground">
              Gap: {formatPrice(hoveredPoint.estimatedPotential - hoveredPoint.currentRevenue)}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {(Object.keys(QUADRANT_LABELS) as Array<keyof typeof QUADRANT_LABELS>).map((key) => (
          <div key={key} className="flex items-center gap-2">
            <div className={cn('w-3 h-3 rounded-full', QUADRANT_COLORS[key].replace('fill-', 'bg-'))} />
            <span className="font-medium">{QUADRANT_LABELS[key].label}</span>
            <span className="text-muted-foreground">({quadrantCounts[key]})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
