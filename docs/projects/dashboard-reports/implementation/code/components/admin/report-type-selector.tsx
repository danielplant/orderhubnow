/**
 * Report Type Selector
 * ============================================================================
 * Tab-based selector for switching between report types.
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

const tabVariants = cva(
  [
    'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
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
  const configs = getAllReportConfigs();

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {configs.map((config) => {
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
                  aria-label={`${config.name}${isDisabled ? ' (requires schema update)' : ''}`}
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
                    Requires schema update (Phase 1)
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
