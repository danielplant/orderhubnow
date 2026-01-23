import { Suspense } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  XCircle,
  Database,
  ShoppingBag,
  Server,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// ============================================================================
// Data Fetching
// ============================================================================

async function getDashboardData() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const [summaryRes, activityRes, errorsRes] = await Promise.all([
      fetch(`${baseUrl}/api/admin/shopify/sync/dashboard/summary`, { cache: 'no-store' }),
      fetch(`${baseUrl}/api/admin/shopify/sync/dashboard/activity?limit=10`, { cache: 'no-store' }),
      fetch(`${baseUrl}/api/admin/shopify/sync/dashboard/errors?limit=5`, { cache: 'no-store' }),
    ]);

    const [summary, activity, errors] = await Promise.all([
      summaryRes.ok ? summaryRes.json() : { summary: null },
      activityRes.ok ? activityRes.json() : { activity: [] },
      errorsRes.ok ? errorsRes.json() : { errors: [] },
    ]);

    return {
      summary: summary.summary,
      activity: activity.activity || [],
      errors: errors.errors || [],
    };
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    return { summary: null, activity: [], errors: [] };
  }
}

// ============================================================================
// Components
// ============================================================================

function ConnectionCard({
  title,
  icon,
  status,
}: {
  title: string;
  icon: React.ReactNode;
  status: boolean | 'loading';
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div className="flex-1">
          <p className="text-sm font-medium">{title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {status === 'loading' ? (
              <span className="text-xs text-muted-foreground">Loading...</span>
            ) : status ? (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs text-green-600">Connected</span>
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs text-red-600">Not configured</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subValue,
  icon,
}: {
  label: string;
  value: number | string;
  subValue?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-0.5">{subValue}</p>
          )}
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// ============================================================================
// Main Page
// ============================================================================

async function DashboardContent() {
  const { summary, activity, errors } = await getDashboardData();

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Connections
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <ConnectionCard
            title="Database"
            icon={<Database className="h-5 w-5" />}
            status={summary?.connections?.database ?? false}
          />
          <ConnectionCard
            title="Shopify"
            icon={<ShoppingBag className="h-5 w-5" />}
            status={summary?.connections?.shopify ?? false}
          />
          <ConnectionCard
            title="Redis"
            icon={<Server className="h-5 w-5" />}
            status={summary?.connections?.redis ?? false}
          />
        </div>
      </section>

      {/* Stats Cards */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Last 24 Hours
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Total Syncs"
            value={summary?.last24Hours?.totalRuns ?? 0}
            subValue={`${summary?.last24Hours?.successful ?? 0} successful`}
            icon={<RefreshCw className="h-5 w-5" />}
          />
          <StatCard
            label="Failed"
            value={summary?.last24Hours?.failed ?? 0}
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          />
          <StatCard
            label="Records Written"
            value={(summary?.last24Hours?.recordsWritten ?? 0).toLocaleString()}
            icon={<Database className="h-5 w-5" />}
          />
          <StatCard
            label="Active Mappings"
            value={summary?.mappings?.active ?? 0}
            subValue={`of ${summary?.mappings?.total ?? 0} total`}
            icon={<ArrowRight className="h-5 w-5" />}
          />
        </div>
      </section>

      {/* Recent Activity */}
      <section className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-medium">Recent Activity</h3>
            <Link
              href="/admin/dev/shopify/sync/history"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {activity.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No recent activity</p>
            ) : (
              activity.slice(0, 5).map((entry: {
                id: string;
                type: string;
                mappingName?: string;
                status: string;
                startedAt: string;
                recordsWritten?: number;
              }) => (
                <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {entry.type} sync {entry.mappingName && `- ${entry.mappingName}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(entry.startedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.recordsWritten !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {entry.recordsWritten} records
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        entry.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : entry.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Errors */}
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-medium">Recent Errors</h3>
          </div>
          <div className="divide-y divide-border">
            {errors.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No recent errors</p>
            ) : (
              errors.slice(0, 5).map((error: {
                id: string;
                mappingName?: string;
                syncType: string;
                startedAt: string;
                errors: string[];
              }) => (
                <div key={error.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-red-600">
                    {error.syncType} sync {error.mappingName && `- ${error.mappingName}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {error.errors[0]?.substring(0, 100)}
                    {error.errors[0]?.length > 100 && '...'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatTimeAgo(error.startedAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="flex gap-3">
          <Link
            href="/admin/dev/shopify/sync/run"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Run Sync
          </Link>
          <Link
            href="/admin/dev/shopify/sync/mappings/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent"
          >
            Create Mapping
          </Link>
          <Link
            href="/admin/dev/shopify/sync/setup"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent"
          >
            Configure
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function SyncDashboardPage() {
  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sync Service Dashboard</h1>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading dashboard...
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </main>
  );
}
