/**
 * Report Type Selector
 * ============================================================================
 * Tab-based selector for switching between report types, grouped by category.
 * Path: src/components/admin/report-type-selector.tsx
 */

'use client';

import * as React from 'react';
import { cva } from 'class-variance-authority';
import {
  LayoutGrid,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  Users,
  Target,
  Award,
  DollarSign,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';
import type { ReportType, ReportConfig } from '@/lib/types/report';
import { getAllReportConfigs } from '@/lib/types/report';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutGrid,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  Users,
  Target,
  Award,
  DollarSign,
  RefreshCw,
};

// Group definitions for report tabs
const REPORT_GROUPS: { label: string; reportTypes: ReportType[] }[] = [
  {
    label: 'Inventory',
    reportTypes: ['category-totals', 'po-sold', 'sku-velocity'],
  },
  {
    label: 'Customers',
    reportTypes: ['customer-ltv', 'cohort-retention', 'account-potential', 'first-to-second'],
  },
  {
    label: 'Operations',
    reportTypes: ['exception', 'rep-scorecard'],
  },
];

const tabVariants = cva(
  [
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
    'border border-transparent',
    focusRing,
  ].join(' '),
  {
    variants: {
      state: {
        active: 'bg-primary text-primary-foreground border-primary',
        inactive: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled: 'text-muted-foreground/50 cursor-not-allowed opacity-50',
      },
    },
    defaultVariants: {
      state: 'inactive',
    },
  }
);

interface ReportTypeSelectorProps {
  value: ReportType;
  onChange: (type: ReportType) => void;
  className?: string;
}

export function ReportTypeSelector({ value, onChange, className }: ReportTypeSelectorProps) {
  const allConfigs = getAllReportConfigs();
  const configMap = React.useMemo(() => {
    const map = new Map<ReportType, ReportConfig>();
    allConfigs.forEach((c) => map.set(c.id, c));
    return map;
  }, [allConfigs]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('space-y-3', className)}>
        {REPORT_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 font-medium">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-1">
              {group.reportTypes.map((reportType) => {
                const config = configMap.get(reportType);
                if (!config) return null;

                const Icon = iconMap[config.icon] || LayoutGrid;
                const isActive = value === config.id;
                const isDisabled = config.status === 'needs-schema';
                const state = isActive ? 'active' : isDisabled ? 'disabled' : 'inactive';

                return (
                  <Tooltip key={config.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => !isDisabled && onChange(config.id)}
                        className={cn(tabVariants({ state }))}
                        disabled={isDisabled}
                        aria-pressed={isActive}
                        aria-label={`${config.name}${isDisabled ? ' (coming soon)' : ''}`}
                      >
                        {isDisabled && <Lock className="h-3 w-3" />}
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{config.name}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      <p className="font-medium">{config.name}</p>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                      {isDisabled && (
                        <p className="text-xs text-amber-500 mt-1">
                          Coming soon
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
