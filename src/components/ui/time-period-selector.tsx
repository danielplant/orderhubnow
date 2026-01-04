'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '@/lib/utils';
import type { TimePeriod } from '@/lib/data/mappers/dashboard';

const TIME_PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'ttm', label: 'TTM (12 months)' },
  { value: 'custom', label: 'Custom Range' },
];

interface TimePeriodSelectorProps {
  defaultPeriod?: TimePeriod;
  className?: string;
}

export function TimePeriodSelector({
  defaultPeriod = 'thisMonth',
  className,
}: TimePeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const currentPeriod = (searchParams.get('period') as TimePeriod) || defaultPeriod;
  const [customFrom, setCustomFrom] = useState(searchParams.get('from') || '');
  const [customTo, setCustomTo] = useState(searchParams.get('to') || '');
  const [showCustomPicker, setShowCustomPicker] = useState(currentPeriod === 'custom');

  const updatePeriod = useCallback(
    (period: TimePeriod) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('period', period);
      
      if (period !== 'custom') {
        params.delete('from');
        params.delete('to');
        setShowCustomPicker(false);
      } else {
        setShowCustomPicker(true);
      }
      
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const applyCustomRange = useCallback(() => {
    if (!customFrom || !customTo) return;
    
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', 'custom');
    params.set('from', customFrom);
    params.set('to', customTo);
    
    router.push(`?${params.toString()}`, { scroll: false });
    setShowCustomPicker(false);
  }, [router, searchParams, customFrom, customTo]);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Select value={currentPeriod} onValueChange={(v) => updatePeriod(v as TimePeriod)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          {TIME_PERIOD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {currentPeriod === 'custom' && (
        <Popover open={showCustomPicker} onOpenChange={setShowCustomPicker}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              {customFrom && customTo
                ? `${customFrom} - ${customTo}`
                : 'Set dates'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo}
                className="w-full"
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
