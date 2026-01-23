import { Suspense } from 'react';
import { History, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface SyncRun {
  id: string;
  syncType: string;
  status: 'completed' | 'in_progress' | 'failed';
  startedAt: string;
  completedAt?: string;
  itemCount: number;
  errorMessage?: string;
}

// ============================================================================
// Data Fetching - Direct from ShopifySyncRun
// ============================================================================

async function getHistory(): Promise<SyncRun[]> {
  try {
    const runs = await prisma.shopifySyncRun.findMany({
      orderBy: { StartedAt: 'desc' },
      take: 50,
      select: {
        ID: true,
        SyncType: true,
        Status: true,
        StartedAt: true,
        CompletedAt: true,
        ItemCount: true,
        ErrorMessage: true,
      },
    });

    return runs.map((run) => ({
      id: String(run.ID),
      syncType: run.SyncType,
      status:
        run.Status === 'completed'
          ? 'completed' as const
          : run.Status === 'started'
            ? 'in_progress' as const
            : 'failed' as const,
      startedAt: run.StartedAt.toISOString(),
      completedAt: run.CompletedAt?.toISOString(),
      itemCount: run.ItemCount ?? 0,
      errorMessage: run.ErrorMessage ?? undefined,
    }));
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
    in_progress: { icon: RefreshCw, color: 'bg-amber-100 text-amber-700', label: 'Running' },
    completed: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Completed' },
    failed: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Failed' },
  };

  const { icon: Icon, color, label } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${color}`}>
      <Icon className={`h-3 w-3 ${status === 'in_progress' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function formatDuration(startedAt: string, completedAt?: string): string {
  if (!completedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const ms = end - start;

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function HistoryRow({ run }: { run: SyncRun }) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 text-sm">
        {formatDate(run.startedAt)}
      </td>
      <td className="px-4 py-3 text-sm capitalize">{run.syncType}</td>
      <td className="px-4 py-3 text-sm">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-4 py-3 text-sm text-right">{formatDuration(run.startedAt, run.completedAt)}</td>
      <td className="px-4 py-3 text-sm text-right">
        {run.status === 'completed' ? (
          <span>{run.itemCount.toLocaleString()} items</span>
        ) : run.status === 'failed' && run.errorMessage ? (
          <span className="text-red-600 truncate max-w-[200px] inline-block" title={run.errorMessage}>
            {run.errorMessage.slice(0, 40)}...
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
            <th className="px-4 py-3 text-left text-sm font-medium">Started</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
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
