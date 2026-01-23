'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, Clock, Zap, Database, Image, ArrowRight, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/format';

/**
 * Tesla-Style Sync Dashboard
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

interface ThumbnailStatus {
  inProgress: boolean;
  lastRun: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    currentStep: string | null;
    currentStepDetail: string | null;
    progressPercent: number | null;
    totalImages: number | null;
    processedCount: number | null;
    skippedCount: number | null;
    failedCount: number | null;
    enabledSizes: string[] | null;
    errorMessage: string | null;
  } | null;
}

interface ThumbnailAnalysis {
  totalSkus: number;
  skusWithImages: number;
  needsGenerationCount: number;
  cachedCount: number;
  bySize: {
    sm: { cached: number; needed: number };
    md: { cached: number; needed: number };
    lg: { cached: number; needed: number };
    xl: { cached: number; needed: number };
  };
  enabledSizes: string[];
  estimatedTimeMinutes: number;
}

// Pipeline steps for visualization
const PIPELINE_STEPS = [
  { id: 1, name: 'Initialize', icon: Zap, description: 'Start bulk operation' },
  { id: 2, name: 'Fetch', icon: RefreshCw, description: 'Poll Shopify API' },
  { id: 3, name: 'Ingest', icon: Database, description: 'Process variants' },
  { id: 4, name: 'Transform', icon: ArrowRight, description: 'Build SKU table' },
  { id: 5, name: 'Thumbnails', icon: Image, description: 'Generate images' },
];

function getStepNumber(currentStep: string | null): number {
  if (!currentStep) return 0;
  const match = currentStep.match(/Step (\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getStatusColor(status: string | null, inProgress: boolean): string {
  if (inProgress) return 'text-amber-500';
  if (status === 'completed') return 'text-emerald-500';
  // Use neutral for ready state, even if last run failed
  return 'text-slate-500';
}

function getStatusBgColor(status: string | null, inProgress: boolean): string {
  if (inProgress) return 'bg-amber-500/10 border-amber-500/30';
  if (status === 'completed') return 'bg-emerald-500/10 border-emerald-500/30';
  // Don't show red for old failures - use neutral. User can see failure in "Last Sync Summary"
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

export default function SyncDashboardPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Thumbnail generation state
  const [thumbStatus, setThumbStatus] = useState<ThumbnailStatus | null>(null);
  const [thumbAnalysis, setThumbAnalysis] = useState<ThumbnailAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);

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

  // Initial fetch and polling
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll every 2 seconds when sync is in progress
  useEffect(() => {
    if (!status?.syncInProgress && !isStarting) return;

    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [status?.syncInProgress, isStarting, fetchStatus]);

  // Fetch thumbnail status
  const fetchThumbStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/shopify/thumbnails/status');
      if (res.ok) {
        const data = await res.json();
        setThumbStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch thumbnail status:', err);
    }
  }, []);

  // Initial thumbnail status fetch
  useEffect(() => {
    fetchThumbStatus();
  }, [fetchThumbStatus]);

  // Poll thumbnail status when generation is in progress
  useEffect(() => {
    if (!thumbStatus?.inProgress && !isGenerating) return;

    const interval = setInterval(fetchThumbStatus, 2000);
    return () => clearInterval(interval);
  }, [thumbStatus?.inProgress, isGenerating, fetchThumbStatus]);

  // Analyze thumbnails
  const analyzeThumbnails = async () => {
    setIsAnalyzing(true);
    setThumbError(null);

    try {
      const res = await fetch('/api/admin/shopify/thumbnails/analyze');
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to analyze');

      setThumbAnalysis(data.analysis);
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate thumbnails
  const generateThumbnails = async () => {
    setIsGenerating(true);
    setThumbError(null);

    try {
      const res = await fetch('/api/admin/shopify/thumbnails/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to start generation');

      // Immediately fetch status to show progress
      await fetchThumbStatus();
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : 'Failed to generate');
      setIsGenerating(false);
    }
  };

  // Clear isGenerating when thumbnail generation completes
  useEffect(() => {
    if (thumbStatus && !thumbStatus.inProgress && isGenerating) {
      setIsGenerating(false);
    }
  }, [thumbStatus, isGenerating]);

  // Start sync
  const startSync = async () => {
    // #region agent log - D: startSync entry
    fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:130',message:'startSync called',data:{isStartingBefore:isStarting},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
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
      // #region agent log - D: POST response
      fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:146',message:'POST response',data:{resOk:res.ok,success:data.success,error:data.error,status:res.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Sync failed');
      }

      setResult(data);
      await fetchStatus();
    } catch (err) {
      // #region agent log - D: startSync error
      fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:158',message:'startSync error',data:{error:err instanceof Error ? err.message : String(err)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      // #region agent log - D: startSync finally
      fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:164',message:'startSync finally - clearing isStarting',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      setIsStarting(false);
    }
  };

  const lastRun = status?.lastRun;
  const inProgress = status?.syncInProgress || isStarting;

  // When isStarting but API hasn't confirmed yet, show "starting" state (not stale data)
  const isStartingNewSync = isStarting && !status?.syncInProgress;

  // Normalize stale "started" runs (older than in-progress window)
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
    ? 1  // Initialize step active when starting
    : getStepNumber(normalizedLastRun?.currentStep ?? null);

  // Progress: 0% when starting new sync, 100% when completed, actual during sync
  const progressPercent = isStartingNewSync
    ? 0  // New sync starting - reset to 0%
    : normalizedLastRun?.status === 'completed'
      ? 100
      : (inProgress ? (normalizedLastRun?.progressPercent ?? 0) : 0);

  // #region agent log - C,E: Computed UI values
  useEffect(() => {
    fetch('http://127.0.0.1:7243/ingest/a5fde547-ac60-4379-a83d-f48710b84ace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:197',message:'Computed UI values',data:{inProgress,isStarting,isStartingNewSync,isStaleStartedRun,syncInProgress:status?.syncInProgress,lastRunStatus:lastRun?.status,normalizedStatus:normalizedLastRun?.status,currentStepNum,progressPercent,rawProgressPercent:normalizedLastRun?.progressPercent},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C,E',runId:'post-fix'})}).catch(()=>{});
  }, [inProgress, isStarting, isStartingNewSync, isStaleStartedRun, status?.syncInProgress, lastRun?.status, normalizedLastRun?.status, currentStepNum, progressPercent, normalizedLastRun?.progressPercent]);
  // #endregion

  return (
    <main className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sync Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Shopify → Database Pipeline
            </p>
          </div>
          <Link
            href="/admin/dev/shopify/sync/mappings"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View Mapping Docs →
          </Link>
        </div>
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

        {/* Error Message - only show during/right after a failed sync, not for old failures */}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

      {/* Thumbnail Generation Section */}
      <div className="mt-6 rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Image className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Thumbnail Generation</h2>
        </div>

        {/* Progress when generating */}
        {(thumbStatus?.inProgress || isGenerating) && thumbStatus?.lastRun && (
          <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {thumbStatus.lastRun.currentStepDetail || 'Starting...'}
              </span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                {thumbStatus.lastRun.progressPercent ?? 0}%
              </span>
            </div>
            <div className="w-full h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${thumbStatus.lastRun.progressPercent ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {thumbStatus.lastRun.processedCount?.toLocaleString() ?? 0} of {thumbStatus.lastRun.totalImages?.toLocaleString() ?? 0} images
            </p>
          </div>
        )}

        {/* Last run result */}
        {thumbStatus?.lastRun && !thumbStatus.inProgress && !isGenerating && (
          <div className={`mb-4 p-4 rounded-xl ${thumbStatus.lastRun.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <div className="flex items-center gap-2">
              {thumbStatus.lastRun.status === 'completed' ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className={`text-sm font-medium ${thumbStatus.lastRun.status === 'completed' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {thumbStatus.lastRun.status === 'completed'
                  ? `Generated ${thumbStatus.lastRun.processedCount?.toLocaleString() ?? 0} thumbnails`
                  : `Failed: ${thumbStatus.lastRun.errorMessage}`}
              </span>
            </div>
          </div>
        )}

        {/* Analysis results */}
        {thumbAnalysis && !thumbStatus?.inProgress && !isGenerating && (
          <div className="mb-4 p-4 rounded-xl bg-muted">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Thumbnails Needed</span>
            </div>
            <div className="grid grid-cols-4 gap-3 text-sm">
              {(['sm', 'md', 'lg', 'xl'] as const).map((size) => {
                const data = thumbAnalysis.bySize[size];
                const enabled = thumbAnalysis.enabledSizes.includes(size);
                return (
                  <div key={size} className={enabled ? '' : 'opacity-50'}>
                    <p className="text-xs text-muted-foreground uppercase">{size}</p>
                    <p className="font-semibold">{data.needed.toLocaleString()}</p>
                    <div className="w-full h-1.5 bg-muted-foreground/20 rounded-full mt-1">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (data.needed / (data.needed + data.cached || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {thumbAnalysis.needsGenerationCount.toLocaleString()} images need thumbnails
              {thumbAnalysis.estimatedTimeMinutes > 0 && ` (~${thumbAnalysis.estimatedTimeMinutes} min)`}
            </p>
          </div>
        )}

        {/* Error */}
        {thumbError && (
          <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{thumbError}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={analyzeThumbnails}
            disabled={isAnalyzing || thumbStatus?.inProgress || isGenerating || inProgress}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4" />
                Analyze
              </>
            )}
          </button>
          <button
            onClick={generateThumbnails}
            disabled={thumbStatus?.inProgress || isGenerating || inProgress}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {thumbStatus?.inProgress || isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Image className="h-4 w-4" />
                Generate Thumbnails
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Generate thumbnails separately from sync for faster sync times.
          Click Analyze first to see how many images need processing.
        </p>
      </div>
    </main>
  );
}
