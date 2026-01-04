/**
 * Exception Tabs
 * ============================================================================
 * Tabbed interface for Exception Report with bulk email action.
 * Path: src/components/admin/exception-tabs.tsx
 */

'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CheckCircle2, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionButtons, generateDefaultActions } from './action-buttons';

type ExceptionType =
  | 'late-account'
  | 'declining-account'
  | 'stalled-new-account'
  | 'dead-sku'
  | 'hot-sku'
  | 'underperforming-rep';

type TabId = 'accounts' | 'skus' | 'reps';

interface ExceptionRow {
  type: ExceptionType;
  entityId: string;
  entityName: string;
  metric: string;
  actual: string;
  expected: string;
  severity: 'high' | 'medium' | 'low';
  daysSinceTriggered: number;
  actions: string[];
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
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
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
  
  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  
  // Use URL param if not controlled
  const urlTab = searchParams.get('tab') as TabId | null;
  const activeTab = controlledTab || urlTab || 'accounts';

  const handleTabChange = (tab: TabId) => {
    // Clear selection when changing tabs
    setSelectedIds(new Set());
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

  // Toggle single row selection
  const toggleSelection = (entityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredData.map((r) => r.entityId)));
    }
  };

  // Clear selection
  const clearSelection = () => setSelectedIds(new Set());

  // Handle bulk email
  const handleBulkEmail = () => {
    // For now, open mailto with entity names - in production this would use actual emails
    const selectedRows = filteredData.filter((r) => selectedIds.has(r.entityId));
    const entityNames = selectedRows.map((r) => r.entityName).join(', ');
    
    // Create mailto link (placeholder - would use actual emails in production)
    const subject = encodeURIComponent(`Follow-up: ${selectedRows.length} accounts need attention`);
    const body = encodeURIComponent(`Hi,\n\nThis is a follow-up regarding the following accounts:\n\n${selectedRows.map(r => `- ${r.entityName}: ${r.metric} is ${r.actual} (expected ${r.expected})`).join('\n')}\n\nPlease let me know if you have any questions.\n\nBest regards`);
    
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  const isAllSelected = filteredData.length > 0 && selectedIds.size === filteredData.length;
  const isSomeSelected = selectedIds.size > 0;

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

      {/* Bulk Action Bar */}
      {isSomeSelected && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md border">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleBulkEmail}>
            <Mail className="h-4 w-4" />
            Email All
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

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
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-muted-foreground/50"
                    aria-label="Select all"
                  />
                </th>
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
              {filteredData.map((row, index) => {
                const isSelected = selectedIds.has(row.entityId);
                return (
                  <tr 
                    key={`${row.type}-${row.entityId}-${index}`} 
                    className={cn(
                      'border-t hover:bg-muted/5',
                      isSelected && 'bg-primary/5'
                    )}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(row.entityId)}
                        className="h-4 w-4 rounded border-muted-foreground/50"
                        aria-label={`Select ${row.entityName}`}
                      />
                    </td>
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
                        actions={generateDefaultActions(
                          activeTab === 'accounts' ? 'customer' : activeTab === 'skus' ? 'sku' : 'rep',
                          row.entityId
                        )}
                        entityId={row.entityId}
                        entityType={activeTab === 'accounts' ? 'customer' : activeTab === 'skus' ? 'sku' : 'rep'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
