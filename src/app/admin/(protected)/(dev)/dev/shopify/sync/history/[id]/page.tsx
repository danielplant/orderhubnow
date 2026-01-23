'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Clock, RefreshCw, FileText } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/format';

interface SyncRunDetail {
  id: string;
  mappingId?: string;
  mappingName?: string;
  syncType: 'full' | 'incremental' | 'webhook';
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggeredBy?: string;
  startedAt: string;
  completedAt?: string;
  recordsFetched?: number;
  recordsWritten?: number;
  recordsSkipped?: number;
  recordsFailed?: number;
  durationMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export default function HistoryDetailPage() {
  const params = useParams();
  const runId = params.id as string;

  const [run, setRun] = useState<SyncRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRun() {
      try {
        const res = await fetch(`/api/admin/shopify/sync/history/${runId}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error?.message || 'Failed to load sync run');
        }

        setRun(data.run);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sync run');
      } finally {
        setLoading(false);
      }
    }

    loadRun();
  }, [runId]);

  const formatDuration = (ms?: number): string => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const formatDateLocal = (dateStr?: string): string => {
    if (!dateStr) return '-';
    return formatDateTime(dateStr);
  };

  const StatusBadge = ({ status }: { status: SyncRunDetail['status'] }) => {
    const config = {
      pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
      running: { icon: RefreshCw, color: 'bg-blue-100 text-blue-700', label: 'Running' },
      completed: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Completed' },
      failed: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Failed' },
    };

    const { icon: Icon, color, label } = config[status];

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${color}`}>
        <Icon className={`h-4 w-4 ${status === 'running' ? 'animate-spin' : ''}`} />
        {label}
      </span>
    );
  };

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading...
        </div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="p-6">
        <Link
          href="/admin/dev/shopify/sync/history"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to history
        </Link>
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">
          {error || 'Sync run not found'}
        </div>
      </main>
    );
  }

  return (
    <main className="p-6">
      <Link
        href="/admin/dev/shopify/sync/history"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to history
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sync Run Details</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">{run.id}</p>
        </div>
        <StatusBadge status={run.status} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Overview */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Overview</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Mapping</dt>
              <dd className="font-medium">
                {run.mappingId ? (
                  <Link
                    href={`/admin/dev/shopify/sync/mappings/${run.mappingId}`}
                    className="text-primary hover:underline"
                  >
                    {run.mappingName || run.mappingId}
                  </Link>
                ) : (
                  '-'
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sync Type</dt>
              <dd className="font-medium capitalize">{run.syncType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Triggered By</dt>
              <dd className="font-medium">{run.triggeredBy || 'Manual'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Started</dt>
              <dd className="font-medium">{formatDateLocal(run.startedAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Completed</dt>
              <dd className="font-medium">{formatDateLocal(run.completedAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Duration</dt>
              <dd className="font-medium">{formatDuration(run.durationMs)}</dd>
            </div>
          </dl>
        </div>

        {/* Statistics */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Statistics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">Records Fetched</p>
              <p className="text-2xl font-semibold">{run.recordsFetched ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">Records Written</p>
              <p className="text-2xl font-semibold text-green-600">{run.recordsWritten ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">Records Skipped</p>
              <p className="text-2xl font-semibold text-yellow-600">{run.recordsSkipped ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">Records Failed</p>
              <p className="text-2xl font-semibold text-red-600">{run.recordsFailed ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Error Message (if failed) */}
        {run.status === 'failed' && run.errorMessage && (
          <div className="col-span-2 rounded-lg border border-red-200 bg-red-50 p-6">
            <h2 className="font-semibold text-red-700 mb-2 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Error
            </h2>
            <pre className="text-sm text-red-600 whitespace-pre-wrap font-mono bg-red-100 p-4 rounded">
              {run.errorMessage}
            </pre>
          </div>
        )}

        {/* Metadata (if present) */}
        {run.metadata && Object.keys(run.metadata).length > 0 && (
          <div className="col-span-2 rounded-lg border border-border bg-card p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Metadata
            </h2>
            <pre className="text-sm whitespace-pre-wrap font-mono bg-muted p-4 rounded overflow-x-auto">
              {JSON.stringify(run.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
