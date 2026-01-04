import { Suspense } from 'react';
import Link from 'next/link';
import { ShoppingCart, DollarSign, Package, RefreshCw } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { getDashboardMetrics } from '@/lib/data/queries/dashboard';
import { formatNumber, formatCurrency } from '@/lib/utils';
import type { TimePeriod, DateRange } from '@/lib/data/mappers/dashboard';

interface DashboardMetricsProps {
  period: TimePeriod;
  customRange?: DateRange;
}

async function MetricsContent({ period, customRange }: DashboardMetricsProps) {
  const metrics = await getDashboardMetrics(period, customRange);
  
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Orders"
        value={formatNumber(metrics.ordersCount)}
        icon={<ShoppingCart className="h-5 w-5" />}
        change={metrics.ordersChange}
        trend={metrics.ordersTrend}
        trendLabel="vs prior period"
      />
      
      <MetricCard
        label="Revenue"
        value={formatCurrency(metrics.revenue)}
        icon={<DollarSign className="h-5 w-5" />}
        change={metrics.revenueChange}
        trend={metrics.revenueTrend}
        trendLabel="vs prior period"
      />
      
      <MetricCard
        label="Units in Stock"
        value={formatNumber(metrics.unitsInStock)}
        icon={<Package className="h-5 w-5" />}
      />
      
      <Link href="/admin/orders?syncStatus=pending" className="block">
        <MetricCard
          label="Pending Sync"
          value={formatNumber(metrics.pendingSyncCount)}
          icon={<RefreshCw className="h-5 w-5" />}
          className="cursor-pointer transition-colors hover:border-primary"
        />
      </Link>
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg border bg-muted/30"
        />
      ))}
    </div>
  );
}

export function DashboardMetrics({ period, customRange }: DashboardMetricsProps) {
  return (
    <Suspense fallback={<MetricsSkeleton />}>
      <MetricsContent period={period} customRange={customRange} />
    </Suspense>
  );
}
