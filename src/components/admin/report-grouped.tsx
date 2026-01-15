/**
 * Report Grouped
 * ============================================================================
 * Collapsible hierarchy table for grouped reports (e.g., Category Totals).
 * Path: src/components/admin/report-grouped.tsx
 */

'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { formatDate } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import type { ColumnDefinition } from '@/lib/types/report';

interface ReportGroupedProps<T extends Record<string, unknown>> {
  data: T[];
  groupByField: string;
  subGroupField?: string;
  columns: ColumnDefinition[];
  visibleColumns: string[];
  aggregateFields: string[];
  onRowClick?: (row: T) => void;
}

interface GroupData<T> {
  key: string;
  label: string;
  rows: T[];
  subGroups?: GroupData<T>[];
  aggregates: Record<string, number>;
}

export function ReportGrouped<T extends Record<string, unknown>>({
  data,
  groupByField,
  subGroupField,
  columns,
  visibleColumns,
  aggregateFields,
  onRowClick,
}: ReportGroupedProps<T>) {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = React.useState(false);

  // Filter visible columns
  const displayColumns = columns.filter((col) => visibleColumns.includes(col.id));

  // Group data by the groupByField
  const groups = React.useMemo(() => {
    const groupMap = new Map<string, T[]>();

    data.forEach((row) => {
      const groupKey = String(row[groupByField] ?? 'Uncategorized');
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }
      groupMap.get(groupKey)!.push(row);
    });

    const result: GroupData<T>[] = [];

    groupMap.forEach((rows, key) => {
      // Calculate aggregates for the group
      const aggregates: Record<string, number> = {};
      aggregateFields.forEach((field) => {
        aggregates[field] = rows.reduce((sum, row) => {
          const val = row[field];
          return sum + (typeof val === 'number' ? val : 0);
        }, 0);
      });

      // Sub-group if subGroupField is provided
      let subGroups: GroupData<T>[] | undefined;
      if (subGroupField) {
        const subGroupMap = new Map<string, T[]>();
        rows.forEach((row) => {
          const subKey = String(row[subGroupField] ?? 'Other');
          if (!subGroupMap.has(subKey)) {
            subGroupMap.set(subKey, []);
          }
          subGroupMap.get(subKey)!.push(row);
        });

        // Only create sub-groups if there are multiple distinct values
        // or if the sub-group key differs from the main group key
        const distinctSubKeys = Array.from(subGroupMap.keys());
        const hasMultipleSubGroups = distinctSubKeys.length > 1;
        const subKeyDiffersFromMain = distinctSubKeys.length === 1 && distinctSubKeys[0] !== key;
        
        if (hasMultipleSubGroups || subKeyDiffersFromMain) {
          subGroups = [];
          subGroupMap.forEach((subRows, subKey) => {
            const subAggregates: Record<string, number> = {};
            aggregateFields.forEach((field) => {
              subAggregates[field] = subRows.reduce((sum, row) => {
                const val = row[field];
                return sum + (typeof val === 'number' ? val : 0);
              }, 0);
            });
            subGroups!.push({
              key: `${key}::${subKey}`,
              label: subKey,
              rows: subRows,
              aggregates: subAggregates,
            });
          });
        }
        // If subKey === mainKey and only one sub-group, skip sub-grouping (avoid redundant nesting)
      }

      result.push({
        key,
        label: key,
        rows,
        subGroups,
        aggregates,
      });
    });

    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [data, groupByField, subGroupField, aggregateFields]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedGroups(new Set());
      setAllExpanded(false);
    } else {
      const allKeys = new Set<string>();
      groups.forEach((g) => {
        allKeys.add(g.key);
        g.subGroups?.forEach((sg) => allKeys.add(sg.key));
      });
      setExpandedGroups(allKeys);
      setAllExpanded(true);
    }
  };

  const formatValue = (value: unknown, column: ColumnDefinition): string => {
    if (value === null || value === undefined) return '—';
    
    switch (column.type) {
      case 'currency':
        return formatPrice(Number(value));
      case 'number':
        return Number(value).toLocaleString();
      case 'percent':
        return `${(Number(value) * 100).toFixed(1)}%`;
      case 'date':
        return formatDate(value as string);
      default:
        return String(value);
    }
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Expand/Collapse All */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={toggleAll} className="gap-2">
          <ChevronsUpDown className="h-4 w-4" />
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr><th className="w-8 px-2 py-2" />{displayColumns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    'px-3 py-2 text-left font-medium',
                    col.type === 'number' || col.type === 'currency' ? 'text-right' : ''
                  )}
                >
                  {col.label}
                </th>
              ))}</tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.key}>
                {/* Group Header Row */}
                <tr
                  className="bg-muted/30 cursor-pointer hover:bg-muted/50 font-medium"
                  onClick={() => toggleGroup(group.key)}
                >
                  <td className="px-2 py-2">
                    {expandedGroups.has(group.key) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                  <td className="px-3 py-2" colSpan={1}>
                    {group.label} ({group.rows.length})
                  </td>
                  {displayColumns.slice(1).map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        'px-3 py-2',
                        col.type === 'number' || col.type === 'currency' ? 'text-right' : ''
                      )}
                    >
                      {aggregateFields.includes(col.id)
                        ? formatValue(group.aggregates[col.id], col)
                        : ''}
                    </td>
                  ))}
                </tr>

                {/* Sub-groups or Rows */}
                {expandedGroups.has(group.key) && (
                  <>
                    {group.subGroups ? (
                      // Render sub-groups
                      group.subGroups.map((subGroup) => (
                        <React.Fragment key={subGroup.key}>
                          {/* Sub-group Header */}
                          <tr
                            className="bg-muted/10 cursor-pointer hover:bg-muted/20"
                            onClick={() => toggleGroup(subGroup.key)}
                          >
                            <td className="px-2 py-2 pl-6">
                              {expandedGroups.has(subGroup.key) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="px-3 py-2 pl-6" colSpan={1}>
                              {subGroup.label} ({subGroup.rows.length})
                            </td>
                            {displayColumns.slice(1).map((col) => (
                              <td
                                key={col.id}
                                className={cn(
                                  'px-3 py-2',
                                  col.type === 'number' || col.type === 'currency'
                                    ? 'text-right'
                                    : ''
                                )}
                              >
                                {aggregateFields.includes(col.id)
                                  ? formatValue(subGroup.aggregates[col.id], col)
                                  : ''}
                              </td>
                            ))}
                          </tr>

                          {/* Sub-group Rows */}
                          {expandedGroups.has(subGroup.key) &&
                            subGroup.rows.map((row, idx) => (
                              <tr
                                key={idx}
                                className={cn(
                                  'hover:bg-muted/5',
                                  onRowClick && 'cursor-pointer'
                                )}
                                onClick={() => onRowClick?.(row)}
                              >
                                <td className="px-2 py-2" />
                                {displayColumns.map((col) => (
                                  <td
                                    key={col.id}
                                    className={cn(
                                      'px-3 py-2 pl-10',
                                      col.type === 'number' || col.type === 'currency'
                                        ? 'text-right'
                                        : ''
                                    )}
                                  >
                                    {formatValue(row[col.id], col)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </React.Fragment>
                      ))
                    ) : (
                      // Render rows directly (no sub-groups)
                      group.rows.map((row, idx) => (
                        <tr
                          key={idx}
                          className={cn(
                            'hover:bg-muted/5',
                            onRowClick && 'cursor-pointer'
                          )}
                          onClick={() => onRowClick?.(row)}
                        >
                          <td className="px-2 py-2" />
                          {displayColumns.map((col) => (
                            <td
                              key={col.id}
                              className={cn(
                                'px-3 py-2 pl-6',
                                col.type === 'number' || col.type === 'currency'
                                  ? 'text-right'
                                  : ''
                              )}
                            >
                              {formatValue(row[col.id], col)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Grand Total */}
      <div className="flex justify-end gap-6 px-4 py-2 bg-muted/20 rounded-md text-sm font-medium">
        <span>Total: {data.length} rows</span>
        {aggregateFields.map((field) => {
          const col = columns.find((c) => c.id === field);
          const total = data.reduce((sum, row) => {
            const val = row[field];
            return sum + (typeof val === 'number' ? val : 0);
          }, 0);
          return (
            <span key={field}>
              {col?.label}: {col ? formatValue(total, col) : total.toLocaleString()}
            </span>
          );
        })}
      </div>
    </div>
  );
}
