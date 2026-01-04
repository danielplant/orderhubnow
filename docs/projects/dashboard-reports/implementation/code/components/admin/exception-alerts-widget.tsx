/**
 * Exception Alerts Widget
 * ============================================================================
 * Dashboard widget showing critical exceptions that need attention.
 * Path: src/components/admin/exception-alerts-widget.tsx
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, 
  Clock, 
  TrendingDown, 
  Package, 
  Flame, 
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ExceptionRow, ExceptionType } from '@/lib/types/report';

const EXCEPTION_ICONS: Record<ExceptionType, React.ComponentType<{ className?: string }>> = {
  'late-account': Clock,
  'declining-account': TrendingDown,
  'stalled-new-account': AlertTriangle,
  'dead-sku': Package,
  'hot-sku': Flame,
  'underperforming-rep': TrendingDown,
};

const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const TYPE_COLORS: Record<ExceptionType, string> = {
  'late-account': 'border-l-red-500',
  'declining-account': 'border-l-orange-500',
  'stalled-new-account': 'border-l-amber-500',
  'dead-sku': 'border-l-gray-500',
  'hot-sku': 'border-l-green-500',
  'underperforming-rep': 'border-l-purple-500',
};

interface ExceptionAlertsWidgetProps {
  exceptions: ExceptionRow[];
  maxItems?: number;
  className?: string;
}

export function ExceptionAlertsWidget({
  exceptions,
  maxItems = 5,
  className,
}: ExceptionAlertsWidgetProps) {
  // Group by severity and show most critical first
  const sortedExceptions = React.useMemo(() => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return [...exceptions]
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      .slice(0, maxItems);
  }, [exceptions, maxItems]);

  const highCount = exceptions.filter((e) => e.severity === 'high').length;
  const totalCount = exceptions.length;

  return (
    <Card className={cn('p-0', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold">Exceptions</h3>
          {highCount > 0 && (
            <Badge className="bg-red-100 text-red-800">
              {highCount} critical
            </Badge>
          )}
        </div>
        <Link
          href="/admin/reports?type=exception"
          className={cn(
            'text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1',
            focusRing
          )}
        >
          View all ({totalCount})
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Exception List */}
      {sortedExceptions.length === 0 ? (
        <div className="p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <AlertTriangle className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-sm text-muted-foreground">
            No exceptions to review
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {sortedExceptions.map((exception, index) => {
            const Icon = EXCEPTION_ICONS[exception.type] || AlertTriangle;
            return (
              <li
                key={`${exception.type}-${exception.entityId}-${index}`}
                className={cn(
                  'border-l-4 hover:bg-muted/50 transition-colors',
                  TYPE_COLORS[exception.type]
                )}
              >
                <Link
                  href={`/admin/reports?type=exception&filters=${encodeURIComponent(
                    JSON.stringify([{ fieldId: 'type', operator: 'eq', value: exception.type }])
                  )}`}
                  className="flex items-center gap-3 p-3"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {exception.entityName}
                      </span>
                      <Badge className={cn('text-xs', SEVERITY_COLORS[exception.severity])}>
                        {exception.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {exception.metric}: {exception.actual} (expected {exception.expected})
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer with quick filters */}
      {sortedExceptions.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t p-3">
          <span className="text-xs text-muted-foreground mr-2">Quick filters:</span>
          {['late-account', 'hot-sku', 'dead-sku'].map((type) => {
            const count = exceptions.filter((e) => e.type === type).length;
            if (count === 0) return null;
            return (
              <Link
                key={type}
                href={`/admin/reports?type=exception&filters=${encodeURIComponent(
                  JSON.stringify([{ fieldId: 'type', operator: 'eq', value: type }])
                )}`}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80',
                  focusRing
                )}
              >
                {type.replace(/-/g, ' ')} ({count})
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
