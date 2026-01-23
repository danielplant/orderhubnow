'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, Clock, Zap, Database, ArrowRight, Settings, ChevronDown, ChevronUp, History } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/format';

/**
 * Sync Dashboard
 *
 * Real-time progress tracking with professional, informative UI.
 * Polls the API every 2 seconds during sync for live updates.
 */

interface SyncStatus {
  syncInProgress: boolean;
  lastRun: {
    id: string;
    syncType: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    itemCount: number | null;
    errorMessage: string | null;
    currentStep: string | null;
    currentStepDetail: string | null;
    progressPercent: number | null;
    recordsProcessed: number | null;
    totalRecords: number | null;
  } | null;
  productCount?: number;
}

interface SyncResult {
  success: boolean;
  message: string;
  operationId?: string;
  variantsProcessed?: number;
  skusCreated?: number;
  error?: string;
}

interface SyncHistoryEntry {
  syncTime: string;
  itemCount: number;
  status: 'completed' | 'failed' | 'in_progress';
}

interface SyncSettings {
  backupEnabled: boolean;
  backupRetentionDays: number;
  cleanupStaleBackups: boolean;
  syncMaxWaitMs: number;
  syncPollIntervalMs: number;
}

// Pipeline steps for visualization
const PIPELINE_STEPS = [
  { id: 1, name: 'Initialize', icon: Zap, description: 'Start bulk operation' },
  { id: 2, name: 'Fetch', icon: RefreshCw, description: 'Poll Shopify API' },
  { id: 3, name: 'Ingest', icon: Database, description: 'Process variants' },
  { id: 4, name: 'Transform', icon: ArrowRight, description: 'Build SKU table' },
];

function getStepNumber(currentStep: string | null): number {
  if (!currentStep) return 0;
  const match = currentStep.match(/Step (\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getStatusColor(status: string | null, inProgress: boolean): string {
  if (inProgress) return 'text-amber-500';
  if (status === 'completed') return 'text-emerald-500';
  return 'text-slate-500';
}

function getStatusBgColor(status: string | null, inProgress: boolean): string {
  if (inProgress) return 'bg-amber-500/10 border-amber-500/30';
  if (status === 'completed') return 'bg-emerald-500/10 border-emerald-500/30';
  return 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700';
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatHistoryDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }) + ' at ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function SyncDashboardPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Partial<SyncSettings>>({});

  // Fetch current status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/shopify/sync');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  // Fetch sync history
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/shopify/sync/history?limit=5');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }, []);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/shopify/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSettingsForm(data.settings);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
    fetchHistory();
    fetchSettings();
  }, [fetchStatus, fetchHistory, fetchSettings]);

  // Poll every 2 seconds when sync is in progress
  useEffect(() => {
    if (!status?.syncInProgress && !isStarting) return;

    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
    }, 2000);
    return () => clearInterval(interval);
  }, [status?.syncInProgress, isStarting, fetchStatus, fetchHistory]);

  // Start sync
  const startSync = async () => {
    setIsStarting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/shopify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Sync failed');
      }

      setResult(data);
      await fetchStatus();
      await fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsStarting(false);
    }
  };

  // Save settings
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/shopify/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      if (res.ok) {
        await fetchSettings();
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const lastRun = status?.lastRun;
  const inProgress = status?.syncInProgress || isStarting;

  // When isStarting but API hasn't confirmed yet, show "starting" state
  const isStartingNewSync = isStarting && !status?.syncInProgress;

  // Normalize stale "started" runs
  const isStaleStartedRun = !!lastRun && lastRun.status === 'started' && !status?.syncInProgress;
  const normalizedLastRun = isStaleStartedRun
    ? {
        ...lastRun,
        status: 'timeout',
        currentStep: null,
        currentStepDetail: null,
        progressPercent: 0,
      }
    : lastRun;

  // Show Step 1 as active when starting, otherwise use actual step
  const currentStepNum = isStartingNewSync
    ? 1
    : getStepNumber(normalizedLastRun?.currentStep ?? null);

  // Progress: 0% when starting new sync, 100% when completed, actual during sync
  const progressPercent = isStartingNewSync
    ? 0
    : normalizedLastRun?.status === 'completed'
      ? 100
      : (inProgress ? (normalizedLastRun?.progressPercent ?? 0) : 0);

  return (
    <main className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Sync Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Shopify → Database Pipeline
        </p>
      </div>

      {/* Main Status Card */}
      <div className={`rounded-2xl border-2 p-8 mb-8 transition-colors ${getStatusBgColor(normalizedLastRun?.status ?? null, inProgress)}`}>
        <div className="flex items-start justify-between">
          {/* Left: Status */}
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-6">
              {/* Status Indicator */}
              <div className={`relative w-4 h-4 rounded-full ${inProgress ? 'bg-amber-500' : normalizedLastRun?.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                {inProgress && (
                  <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-75" />
                )}
              </div>
              <span className={`text-2xl font-semibold ${getStatusColor(normalizedLastRun?.status ?? null, inProgress)}`}>
                {inProgress ? 'Syncing' : normalizedLastRun?.status === 'completed' ? 'Synced' : 'Ready'}
              </span>
            </div>

            {/* Current Step Detail */}
            {inProgress && (isStartingNewSync || normalizedLastRun?.currentStepDetail) && (
              <div className="mb-6">
                <p className="text-sm text-muted-foreground mb-1">
                  {isStartingNewSync ? 'Step 1/5' : normalizedLastRun?.currentStep}
                </p>
                <p className="text-lg font-medium">
                  {isStartingNewSync ? 'Starting sync...' : normalizedLastRun?.currentStepDetail}
                </p>
              </div>
            )}

            {/* Stats Row - only show live stats when syncing */}
            {normalizedLastRun && inProgress && (
              <div className="flex gap-8 text-sm">
                <div>
                  <span className="text-muted-foreground">Started</span>
                  <p className="font-medium">{formatTime(normalizedLastRun.startedAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration</span>
                  <p className="font-medium">{formatDuration(normalizedLastRun.startedAt, normalizedLastRun.completedAt)}</p>
                </div>
                {normalizedLastRun.recordsProcessed != null && (
                  <div>
                    <span className="text-muted-foreground">Processed</span>
                    <p className="font-medium">{(normalizedLastRun.recordsProcessed ?? 0).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
            {/* Show last run info when not syncing */}
            {normalizedLastRun && !inProgress && normalizedLastRun.status === 'completed' && (
              <div className="flex gap-8 text-sm">
                <div>
                  <span className="text-muted-foreground">Last Sync</span>
                  <p className="font-medium">{formatDate(normalizedLastRun.startedAt)}</p>
                </div>
                {normalizedLastRun.itemCount != null && (
                  <div>
                    <span className="text-muted-foreground">SKUs</span>
                    <p className="font-medium">{(normalizedLastRun.itemCount ?? 0).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Progress Ring */}
          <div className="relative w-32 h-32 flex-shrink-0">
            <svg className="w-32 h-32 transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-slate-200 dark:text-slate-700"
              />
              {/* Progress circle */}
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 56}`}
                strokeDashoffset={`${2 * Math.PI * 56 * (1 - progressPercent / 100)}`}
                className={`transition-all duration-500 ${inProgress ? 'text-amber-500' : normalizedLastRun?.status === 'completed' ? 'text-emerald-500' : 'text-slate-300'}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold">{progressPercent}%</span>
            </div>
          </div>
        </div>

        {/* Error Message - only show during/right after a failed sync */}
        {normalizedLastRun?.errorMessage && inProgress && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300">{normalizedLastRun.errorMessage}</p>
          </div>
        )}
      </div>

      {/* Pipeline Visualization */}
      <div className="rounded-2xl border bg-card p-6 mb-8">
        <h2 className="text-lg font-semibold mb-6">Pipeline Progress</h2>
        <div className="flex items-center justify-between">
          {PIPELINE_STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = currentStepNum === step.id;
            const isComplete = currentStepNum > step.id || (normalizedLastRun?.status === 'completed' && !inProgress);

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                      isComplete
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : isActive
                          ? 'bg-amber-500/20 border-amber-500 text-amber-500'
                          : 'bg-muted border-muted-foreground/20 text-muted-foreground'
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : isActive ? (
                      <StepIcon className="w-6 h-6 animate-pulse" />
                    ) : (
                      <StepIcon className="w-6 h-6" />
                    )}
                  </div>
                  <div className="mt-3 text-center">
                    <p className={`text-sm font-medium ${isActive ? 'text-amber-500' : isComplete ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                      {step.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                </div>
                {index < PIPELINE_STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-4 transition-colors ${
                      isComplete ? 'bg-emerald-500' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Run Control */}
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Sync Control</h2>

          <button
            onClick={startSync}
            disabled={inProgress}
            className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 text-base font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {inProgress ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                Sync in Progress...
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                Start Full Sync
              </>
            )}
          </button>

          {inProgress && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Progress updates automatically every 2 seconds
            </p>
          )}

          {error && (
            <div className="mt-4 p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Error</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
            </div>
          )}
        </div>

        {/* Last Sync Results */}
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Last Sync Summary</h2>

          {result ? (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-4 rounded-xl ${result.success ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                {result.success ? (
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-500" />
                )}
                <span className={`font-medium ${result.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                  {result.success ? 'Sync Completed Successfully' : 'Sync Failed'}
                </span>
              </div>

              {result.success && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-muted">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Variants</p>
                    <p className="text-2xl font-bold mt-1">{result.variantsProcessed?.toLocaleString() ?? '-'}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">SKUs Created</p>
                    <p className="text-2xl font-bold mt-1">{result.skusCreated?.toLocaleString() ?? '-'}</p>
                  </div>
                </div>
              )}

              {result.error && (
                <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
              )}
            </div>
          ) : normalizedLastRun && !inProgress ? (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-4 rounded-xl ${normalizedLastRun.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                {normalizedLastRun.status === 'completed' ? (
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-500" />
                )}
                <span className={`font-medium ${normalizedLastRun.status === 'completed' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                  {normalizedLastRun.status === 'completed' ? 'Last Sync Successful' : `Last Sync: ${normalizedLastRun.status}`}
                </span>
              </div>

              {normalizedLastRun.itemCount != null && (
                <div className="p-4 rounded-xl bg-muted">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">SKUs Created</p>
                  <p className="text-2xl font-bold mt-1">{(normalizedLastRun.itemCount ?? 0).toLocaleString()}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mb-4 opacity-50" />
              <p>{inProgress ? 'Sync in progress...' : 'No sync data yet'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Sync History Preview */}
      <div className="rounded-2xl border bg-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Sync History</h2>
          </div>
          <Link
            href="/admin/dev/shopify/sync/history"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View all →
          </Link>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No sync history yet</p>
        ) : (
          <div className="space-y-2">
            {history.map((entry, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  {entry.status === 'completed' ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  ) : entry.status === 'failed' ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                  )}
                  <span className="text-sm">{formatHistoryDate(entry.syncTime)}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className={entry.status === 'completed' ? 'text-foreground' : entry.status === 'failed' ? 'text-red-500' : 'text-amber-500'}>
                    {entry.status === 'completed' ? 'Completed' : entry.status === 'failed' ? 'Failed' : 'Running'}
                  </span>
                  <span className="text-muted-foreground">{entry.itemCount.toLocaleString()} items</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Collapsible Settings */}
      <div className="rounded-2xl border bg-card">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-6 text-left"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Sync Settings</h2>
          </div>
          {showSettings ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {showSettings && settings && (
          <div className="px-6 pb-6 border-t border-border pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Backup Configuration */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Backup Configuration</h3>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settingsForm.backupEnabled ?? true}
                    onChange={e => setSettingsForm(prev => ({ ...prev, backupEnabled: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span className="text-sm">Enable pre-sync backups</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settingsForm.cleanupStaleBackups ?? true}
                    onChange={e => setSettingsForm(prev => ({ ...prev, cleanupStaleBackups: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span className="text-sm">Auto-cleanup old backups</span>
                </label>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Retention Period (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={settingsForm.backupRetentionDays ?? 7}
                    onChange={e => setSettingsForm(prev => ({ ...prev, backupRetentionDays: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                  />
                </div>
              </div>

              {/* Sync Configuration */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Sync Configuration</h3>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Max Wait Time (ms)</label>
                  <input
                    type="number"
                    min={60000}
                    max={3600000}
                    value={settingsForm.syncMaxWaitMs ?? 600000}
                    onChange={e => setSettingsForm(prev => ({ ...prev, syncMaxWaitMs: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.round((settingsForm.syncMaxWaitMs ?? 600000) / 60000)} minutes
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Poll Interval (ms)</label>
                  <input
                    type="number"
                    min={1000}
                    max={60000}
                    value={settingsForm.syncPollIntervalMs ?? 3000}
                    onChange={e => setSettingsForm(prev => ({ ...prev, syncPollIntervalMs: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {(settingsForm.syncPollIntervalMs ?? 3000) / 1000} seconds between status checks
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
