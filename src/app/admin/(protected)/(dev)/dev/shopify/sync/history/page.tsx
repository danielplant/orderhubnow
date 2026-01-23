import { Suspense } from 'react';
import Link from 'next/link';
import { History, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface SyncRun {
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
}

// ============================================================================
// Data Fetching
// ============================================================================

async function getHistory(): Promise<SyncRun[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/admin/shopify/sync/history?limit=50`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.runs || [];
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return [];
  }
}

// ============================================================================
// Components
// ============================================================================

function StatusBadge({ status }: { status: SyncRun['status'] }) {
  const config = {
    pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
    running: { icon: RefreshCw, color: 'bg-blue-100 text-blue-700', label: 'Running' },
    completed: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Completed' },
    failed: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Failed' },
  };

  const { icon: Icon, color, label } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${color}`}>
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function HistoryRow({ run }: { run: SyncRun }) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 text-sm">
        <Link
          href={`/admin/dev/shopify/sync/history/${run.id}`}
          className="text-primary hover:underline"
        >
          {run.id.slice(0, 8)}...
        </Link>
      </td>
      <td className="px-4 py-3 text-sm">{run.mappingName || '-'}</td>
      <td className="px-4 py-3 text-sm capitalize">{run.syncType}</td>
      <td className="px-4 py-3 text-sm">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-4 py-3 text-sm">{run.triggeredBy || 'manual'}</td>
      <td className="px-4 py-3 text-sm">{formatDate(run.startedAt)}</td>
      <td className="px-4 py-3 text-sm text-right">{formatDuration(run.durationMs)}</td>
      <td className="px-4 py-3 text-sm text-right">
        {run.status === 'completed' ? (
          <span className="text-muted-foreground">
            {run.recordsWritten ?? 0} written
          </span>
        ) : run.status === 'failed' ? (
          <span className="text-red-600 truncate max-w-[150px] inline-block" title={run.errorMessage}>
            {run.errorMessage?.slice(0, 30)}...
          </span>
        ) : (
          '-'
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// Main Page
// ============================================================================

async function HistoryTable() {
  const runs = await getHistory();

  if (runs.length === 0) {
    return (
      <div className="text-center py-12">
        <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No sync history</p>
        <p className="text-muted-foreground">
          Run a sync to see history here
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium">ID</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Mapping</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Triggered By</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Started</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Duration</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((run) => (
            <HistoryRow key={run.id} run={run} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sync History</h1>
        <p className="text-muted-foreground mt-1">
          View past sync operations and their results
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading history...
          </div>
        }
      >
        <HistoryTable />
      </Suspense>
    </main>
  );
}
