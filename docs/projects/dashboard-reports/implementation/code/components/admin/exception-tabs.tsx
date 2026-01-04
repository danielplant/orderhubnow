/**
 * Exception Tabs
 * ============================================================================
 * Tabbed interface for Exception Report.
 * Path: src/components/admin/exception-tabs.tsx
 */

'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import { ActionButtons } from './action-buttons';

type ExceptionType =
  | 'late-account'
  | 'declining-account'
  | 'stalled-new-account'
  | 'dead-sku'
  | 'hot-sku'
  | 'underperforming-rep';

type TabId = 'accounts' | 'skus' | 'reps';

interface ExceptionRow {
  id: string;
  type: ExceptionType;
  entityId: string;
  entityName: string;
  metric: string;
  actual: string;
  expected: string;
  severity: 'critical' | 'warning' | 'info';
  daysSinceTriggered: number;
  actions: Array<{
    type: 'email' | 'call' | 'view' | 'custom';
    label: string;
    href?: string;
    onClick?: () => void;
  }>;
}

interface ExceptionTabsProps {
  data: ExceptionRow[];
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
}

const TAB_CONFIG: Record<TabId, { label: string; types: ExceptionType[] }> = {
  accounts: {
    label: 'Accounts',
    types: ['late-account', 'declining-account', 'stalled-new-account'],
  },
  skus: {
    label: 'SKUs',
    types: ['dead-sku', 'hot-sku'],
  },
  reps: {
    label: 'Reps',
    types: ['underperforming-rep'],
  },
};

const SEVERITY_STYLES = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
};

const TYPE_LABELS: Record<ExceptionType, string> = {
  'late-account': 'Late Account',
  'declining-account': 'Declining Account',
  'stalled-new-account': 'Stalled New Account',
  'dead-sku': 'Dead SKU',
  'hot-sku': 'Hot SKU',
  'underperforming-rep': 'Underperforming Rep',
};

export function ExceptionTabs({
  data,
  activeTab: controlledTab,
  onTabChange,
}: ExceptionTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Use URL param if not controlled
  const urlTab = searchParams.get('tab') as TabId | null;
  const activeTab = controlledTab || urlTab || 'accounts';

  const handleTabChange = (tab: TabId) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      // Update URL
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.push(`?${params.toString()}`);
    }
  };

  // Filter data by tab
  const filteredData = React.useMemo(() => {
    const types = TAB_CONFIG[activeTab].types;
    return data.filter((row) => types.includes(row.type));
  }, [data, activeTab]);

  // Count by tab
  const counts = React.useMemo(() => {
    return {
      accounts: data.filter((r) => TAB_CONFIG.accounts.types.includes(r.type)).length,
      skus: data.filter((r) => TAB_CONFIG.skus.types.includes(r.type)).length,
      reps: data.filter((r) => TAB_CONFIG.reps.types.includes(r.type)).length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex border-b">
        {(Object.keys(TAB_CONFIG) as TabId[]).map((tabId) => {
          const config = TAB_CONFIG[tabId];
          const count = counts[tabId];
          const isActive = activeTab === tabId;

          return (
            <button
              key={tabId}
              type="button"
              onClick={() => handleTabChange(tabId)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              )}
            >
              {config.label}
              <span
                className={cn(
                  'ml-2 px-1.5 py-0.5 rounded-full text-xs',
                  count > 0
                    ? isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
          <p className="text-lg font-medium text-foreground">No issues found</p>
          <p className="text-sm">All {TAB_CONFIG[activeTab].label.toLowerCase()} are performing well</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">
                  {activeTab === 'accounts' ? 'Account' : activeTab === 'skus' ? 'SKU' : 'Rep'}
                </th>
                <th className="px-3 py-2 text-left font-medium">Issue</th>
                <th className="px-3 py-2 text-center font-medium">Severity</th>
                <th className="px-3 py-2 text-right font-medium">Days</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row) => (
                <tr key={row.id} className="border-t hover:bg-muted/5">
                  <td className="px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABELS[row.type]}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{row.entityName}</td>
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground">{row.metric}: </span>
                    <span className="font-medium">{row.actual}</span>
                    <span className="text-muted-foreground"> (expected {row.expected})</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        SEVERITY_STYLES[row.severity]
                      )}
                    >
                      {row.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.daysSinceTriggered}d
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ActionButtons
                      actions={row.actions}
                      entityId={row.entityId}
                      entityType={activeTab === 'accounts' ? 'customer' : activeTab === 'skus' ? 'sku' : 'rep'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
