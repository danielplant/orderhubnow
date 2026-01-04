/**
 * Saved Views Popover
 * ============================================================================
 * Save and load report view configurations.
 * Path: src/components/admin/saved-views-popover.tsx
 */

'use client';

import * as React from 'react';
import { Bookmark, Save, Trash2, Check, Copy } from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { SavedView, ReportType, FilterState, LayoutMode } from '@/lib/types/report';

const STORAGE_KEY = 'myorderhub-saved-views';

// ============================================================================
// Hook for saved views
// ============================================================================

export function useSavedViews() {
  const [views, setViews] = React.useState<SavedView[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  // Load from localStorage on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setViews(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load saved views:', e);
    }
    setLoaded(true);
  }, []);

  // Save to localStorage
  const persist = React.useCallback((newViews: SavedView[]) => {
    setViews(newViews);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newViews));
    } catch (e) {
      console.error('Failed to save views:', e);
    }
  }, []);

  const saveView = React.useCallback(
    (view: Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const newView: SavedView = {
        ...view,
        id: `view-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      };
      persist([...views, newView]);
      return newView.id;
    },
    [views, persist]
  );

  const updateView = React.useCallback(
    (id: string, updates: Partial<SavedView>) => {
      persist(
        views.map((v) =>
          v.id === id
            ? { ...v, ...updates, updatedAt: new Date().toISOString() }
            : v
        )
      );
    },
    [views, persist]
  );

  const deleteView = React.useCallback(
    (id: string) => {
      persist(views.filter((v) => v.id !== id));
    },
    [views, persist]
  );

  const getViewsForReport = React.useCallback(
    (reportType: ReportType) => {
      return views.filter((v) => v.reportType === reportType);
    },
    [views]
  );

  return {
    views,
    loaded,
    saveView,
    updateView,
    deleteView,
    getViewsForReport,
  };
}

// ============================================================================
// Saved Views Popover Component
// ============================================================================

interface SavedViewsPopoverProps {
  reportType: ReportType;
  currentState: {
    columns: string[];
    columnOrder: string[];
    filters: FilterState[];
    sortBy: string | null;
    sortDir: 'asc' | 'desc';
    layout: LayoutMode;
  };
  onLoadView: (view: SavedView) => void;
  savedViewsHook: ReturnType<typeof useSavedViews>;
}

export function SavedViewsPopover({
  reportType,
  currentState,
  onLoadView,
  savedViewsHook,
}: SavedViewsPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [viewName, setViewName] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const { getViewsForReport, saveView, deleteView } = savedViewsHook;
  const views = getViewsForReport(reportType);

  const handleSave = () => {
    if (!viewName.trim()) return;
    
    saveView({
      name: viewName.trim(),
      reportType,
      ...currentState,
    });
    
    setViewName('');
    setSaving(false);
  };

  const handleCopyUrl = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bookmark className="h-4 w-4" />
          <span>Views</span>
          {views.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">
              {views.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Saved Views</span>
            <button
              type="button"
              onClick={handleCopyUrl}
              className={cn(
                'inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground',
                focusRing
              )}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy URL
                </>
              )}
            </button>
          </div>

          {/* Saved views list */}
          {views.length === 0 && !saving ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No saved views yet
            </p>
          ) : (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {views.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onLoadView(view);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex-1 text-left text-sm truncate',
                      focusRing
                    )}
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteView(view.id)}
                    className={cn(
                      'p-1 rounded-sm text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity',
                      focusRing
                    )}
                    aria-label={`Delete ${view.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Save new view */}
          {saving ? (
            <div className="flex items-center gap-2">
              <Input
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="View name..."
                className="h-8 text-sm flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setSaving(false);
                }}
              />
              <Button
                size="sm"
                className="h-8"
                onClick={handleSave}
                disabled={!viewName.trim()}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setSaving(true)}
            >
              <Save className="h-4 w-4" />
              Save current view
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
