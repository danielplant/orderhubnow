/**
 * Filters Popover
 * ============================================================================
 * Dynamic filter builder for reports with multi-select and alias signal logging.
 * Path: src/components/admin/filters-popover.tsx
 */

'use client';

import * as React from 'react';
import { Filter, Plus, X, Search, Check } from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FilterField, FilterState, FilterOperator } from '@/lib/types/report';

// ============================================================================
// AliasSignals Logging Hook
// ============================================================================

function useAliasSignalLogging(reportType: string) {
  const sessionId = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    let id = sessionStorage.getItem('aliasSessionId');
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('aliasSessionId', id);
    }
    return id;
  }, []);

  const logAliasSignal = React.useCallback(
    async (fieldId: string, values: string[]) => {
      // Only log if 2+ values selected
      if (values.length < 2) return;

      // Check debounce (don't log same combo twice per session)
      const key = `alias_${fieldId}_${values.sort().join('_')}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, 'true');

      try {
        await fetch('/api/alias-signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: fieldId,
            values,
            reportType,
            sessionId,
          }),
        });
      } catch (error) {
        console.warn('Failed to log alias signal:', error);
      }
    },
    [reportType, sessionId]
  );

  return { logAliasSignal };
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'equals',
  neq: 'not equals',
  gt: 'greater than',
  lt: 'less than',
  gte: 'at least',
  lte: 'at most',
  contains: 'contains',
  between: 'between',
};

interface FiltersPopoverProps {
  filterFields: FilterField[];
  filters: FilterState[];
  onFiltersChange: (filters: FilterState[]) => void;
  filterOptions?: Record<string, Array<{ value: string; label: string }>>;
  reportType?: string;
}

export function FiltersPopover({
  filterFields,
  filters,
  onFiltersChange,
  filterOptions = {},
  reportType = 'unknown',
}: FiltersPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const { logAliasSignal } = useAliasSignalLogging(reportType);

  const addFilter = () => {
    if (filterFields.length === 0) return;
    
    const firstField = filterFields[0];
    const newFilter: FilterState = {
      fieldId: firstField.id,
      operator: firstField.operators[0],
      value: firstField.allowMultiple ? [] : '',
    };
    onFiltersChange([...filters, newFilter]);
  };

  const updateFilter = (index: number, update: Partial<FilterState>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...update };
    onFiltersChange(newFilters);

    // Log alias signal if multi-value
    const filter = newFilters[index];
    if (Array.isArray(filter.value) && filter.value.length >= 2) {
      logAliasSignal(filter.fieldId, filter.value);
    }
  };

  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onFiltersChange([]);
  };

  const activeCount = filters.filter((f) => f.value).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Filters</span>
            {filters.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className={cn(
                  'text-xs text-muted-foreground hover:text-foreground',
                  focusRing
                )}
              >
                Clear all
              </button>
            )}
          </div>

          {filters.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No filters applied
            </p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filters.map((filter, index) => {
                const field = filterFields.find((f) => f.id === filter.fieldId);
                if (!field) return null;

                const options = filterOptions[field.id] || field.options || [];

                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                  >
                    {/* Field selector */}
                    <Select
                      value={filter.fieldId}
                      onValueChange={(v) =>
                        updateFilter(index, {
                          fieldId: v,
                          operator: filterFields.find((f) => f.id === v)?.operators[0] || 'eq',
                          value: '',
                        })
                      }
                    >
                      <SelectTrigger className="w-24 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {filterFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Operator selector */}
                    <Select
                      value={filter.operator}
                      onValueChange={(v) =>
                        updateFilter(index, { operator: v as FilterOperator })
                      }
                    >
                      <SelectTrigger className="w-20 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.operators.map((op) => (
                          <SelectItem key={op} value={op}>
                            {OPERATOR_LABELS[op]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value input - searchable dropdown (with optional multi-select) or text */}
                    {field.type === 'select' || field.type === 'searchable' ? (
                      <SearchableSelect
                        options={options}
                        value={filter.value}
                        onChange={(v) => updateFilter(index, { value: v })}
                        searchable={field.type === 'searchable'}
                        multiple={field.allowMultiple}
                        placeholder="Select..."
                      />
                    ) : (
                      <Input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={filter.value as string}
                        onChange={(e) =>
                          updateFilter(index, { value: e.target.value })
                        }
                        className="h-8 text-xs flex-1"
                        placeholder="Value..."
                      />
                    )}

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeFilter(index)}
                      className={cn(
                        'p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted',
                        focusRing
                      )}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {filterFields.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={addFilter}
            >
              <Plus className="h-4 w-4" />
              Add filter
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Internal searchable select component with optional multi-select
interface SearchableSelectProps {
  options: Array<{ value: string; label: string }>;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  searchable?: boolean;
  multiple?: boolean;
  placeholder?: string;
}

function SearchableSelect({
  options,
  value,
  onChange,
  searchable,
  multiple,
  placeholder = 'Select...',
}: SearchableSelectProps) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);

  // Normalize value to array for multi-select
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

  const filtered = React.useMemo(() => {
    if (!query) return options;
    const lower = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(lower) ||
        o.value.toLowerCase().includes(lower)
    );
  }, [options, query]);

  const getLabel = (v: string) => options.find((o) => o.value === v)?.label || v;

  // Handle selection for multi-select
  const handleSelect = (optionValue: string) => {
    if (multiple) {
      if (selectedValues.includes(optionValue)) {
        // Remove
        onChange(selectedValues.filter((v) => v !== optionValue));
      } else {
        // Add
        onChange([...selectedValues, optionValue]);
      }
    } else {
      onChange(optionValue);
      setOpen(false);
    }
    setQuery('');
  };

  const removeValue = (v: string) => {
    onChange(selectedValues.filter((val) => val !== v));
  };

  // Simple dropdown for non-searchable, non-multiple
  if (!searchable && !multiple) {
    return (
      <Select value={value as string} onValueChange={onChange as (v: string) => void}>
        <SelectTrigger className="h-8 text-xs flex-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Multi-select with chips
  if (multiple) {
    const MAX_VISIBLE_CHIPS = 3;
    const visibleChips = selectedValues.slice(0, MAX_VISIBLE_CHIPS);
    const overflowCount = selectedValues.length - MAX_VISIBLE_CHIPS;

    return (
      <div className="flex-1">
        {/* Chip display */}
        {selectedValues.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {visibleChips.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded text-xs"
              >
                {getLabel(v)}
                <button
                  type="button"
                  onClick={() => removeValue(v)}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="text-xs text-muted-foreground px-1">
                +{overflowCount} more
              </span>
            )}
          </div>
        )}

        {/* Add more button / dropdown */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'h-6 px-2 text-xs text-left border rounded-md',
                'bg-background hover:bg-muted/50',
                'text-muted-foreground',
                focusRing
              )}
            >
              + Add
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <div className="relative mb-1">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="h-8 pl-8 text-xs"
                autoFocus
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2 text-center">
                  No matches
                </p>
              ) : (
                filtered.map((o) => {
                  const isSelected = selectedValues.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => handleSelect(o.value)}
                      className={cn(
                        'w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-muted flex items-center gap-2',
                        isSelected && 'bg-muted',
                        focusRing
                      )}
                    >
                      <span className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center',
                        isSelected && 'bg-primary border-primary'
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </span>
                      {o.label}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Searchable single-select
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'h-8 px-2 text-xs flex-1 text-left border rounded-md',
            'bg-background hover:bg-muted/50 truncate',
            !value && 'text-muted-foreground',
            focusRing
          )}
        >
          {value ? getLabel(value as string) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="relative mb-1">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="h-8 pl-8 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2 text-center">
              No matches
            </p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => handleSelect(o.value)}
                className={cn(
                  'w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-muted',
                  value === o.value && 'bg-muted font-medium',
                  focusRing
                )}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
