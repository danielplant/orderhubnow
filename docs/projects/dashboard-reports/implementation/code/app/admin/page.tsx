/**
 * Admin Dashboard Page
 * ============================================================================
 * Enhanced dashboard with metrics, widgets, and exception alerts.
 * Path: src/app/admin/page.tsx
 */

import { Suspense } from 'react';
import { auth } from '@/lib/auth/providers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, BarChart3, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimePeriodSelector } from '@/components/ui/time-period-selector';
import { DashboardMetrics } from '@/components/admin/dashboard-metrics';
import { CategoryTotalsWidget } from '@/components/admin/category-totals-widget';
import { POSoldWidget } from '@/components/admin/po-sold-widget';
import { ExceptionAlertsWidget } from '@/components/admin/exception-alerts-widget';
import { AtRiskAccountsWidget } from '@/components/admin/at-risk-accounts-widget';
import { 
  getCategoryTotals, 
  getPOSoldData,
  getPOSoldGrandTotal,
} from '@/lib/data/queries/dashboard';
import { getExceptionReport } from '@/lib/data/queries/reports';
import type { TimePeriod, DateRange } from '@/lib/data/mappers/dashboard';

interface PageProps {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
  }>;
}

// Loading skeletons
function WidgetSkeleton() {
  return (
    <div className="h-96 animate-pulse rounded-lg border bg-muted/30" />
  );
}

function SmallWidgetSkeleton() {
  return (
    <div className="h-64 animate-pulse rounded-lg border bg-muted/30" />
  );
}

// Server component for Category Totals data fetching
async function CategoryTotalsSection() {
  const data = await getCategoryTotals();
  return <CategoryTotalsWidget data={data} />;
}

// Server component for PO Sold data fetching
async function POSoldSection() {
  const [data, grandTotal] = await Promise.all([
    getPOSoldData(),
    getPOSoldGrandTotal(),
  ]);
  return <POSoldWidget data={data} grandTotal={grandTotal} />;
}

// Server component for Exception Alerts
async function ExceptionAlertsSection() {
  try {
    const exceptions = await getExceptionReport();
    return <ExceptionAlertsWidget exceptions={exceptions} maxItems={5} />;
  } catch (error) {
    // Schema not yet updated - show placeholder
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Exception alerts require schema updates.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Run the migration script to enable.
        </p>
      </div>
    );
  }
}

// Server component for At-Risk Accounts
async function AtRiskAccountsSection() {
  try {
    const exceptions = await getExceptionReport({ lateDays: 60 });
    
    // Filter to late accounts and transform to AtRiskAccount format
    const lateAccounts = exceptions
      .filter((e) => e.type === 'late-account')
      .map((e) => ({
        customerId: parseInt(e.entityId, 10),
        storeName: e.entityName,
        segment: 'Unknown' as string,
        ltv: 0,
        daysSinceLastOrder: e.daysSinceTriggered + 60, // Approximate
        usualOrderCycle: null,
        rep: 'Unknown',
        riskReason: `${e.actual} (expected ${e.expected})`,
      }))
      .slice(0, 5);

    return <AtRiskAccountsWidget accounts={lateAccounts} maxItems={5} />;
  } catch (error) {
    // Schema not yet updated - show placeholder
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          At-risk accounts require schema updates.
        </p>
      </div>
    );
  }
}

export default async function AdminDashboard({ searchParams }: PageProps) {
  const session = await auth();
  
  // Ensure user is authenticated and is admin
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/login');
  }
  
  const params = await searchParams;
  const period = (params.period as TimePeriod) || 'thisMonth';
  
  // Parse custom date range if provided
  let customRange: DateRange | undefined;
  if (period === 'custom' && params.from && params.to) {
    customRange = {
      start: new Date(params.from),
      end: new Date(params.to),
    };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session.user.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimePeriodSelector defaultPeriod={period} />
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/admin/reports">
              <BarChart3 className="h-4 w-4" />
              Reports
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <DashboardMetrics period={period} customRange={customRange} />

      {/* Alert Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Exception Alerts */}
        <Suspense fallback={<SmallWidgetSkeleton />}>
          <ExceptionAlertsSection />
        </Suspense>

        {/* At-Risk Accounts */}
        <Suspense fallback={<SmallWidgetSkeleton />}>
          <AtRiskAccountsSection />
        </Suspense>
      </div>

      {/* Widgets Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Totals */}
        <Suspense fallback={<WidgetSkeleton />}>
          <CategoryTotalsSection />
        </Suspense>

        {/* PO Sold Report */}
        <Suspense fallback={<WidgetSkeleton />}>
          <POSoldSection />
        </Suspense>
      </div>

      {/* Quick Access to Reports */}
      <div className="rounded-lg border bg-muted/10 p-4">
        <h3 className="font-medium mb-3">Quick Access to Analytics</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'SKU Velocity', type: 'sku-velocity', icon: '📊' },
            { name: 'Customer LTV', type: 'customer-ltv', icon: '💰' },
            { name: 'Rep Scorecard', type: 'rep-scorecard', icon: '🏆' },
            { name: 'Cohort Retention', type: 'cohort-retention', icon: '📈' },
            { name: 'Account Potential', type: 'account-potential', icon: '🎯' },
            { name: 'First-to-Second', type: 'first-to-second', icon: '🔄' },
          ].map((report) => (
            <Button
              key={report.type}
              variant="outline"
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href={`/admin/reports?type=${report.type}`}>
                <span>{report.icon}</span>
                {report.name}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const metadata = {
  title: 'Dashboard | Admin',
  description: 'Admin dashboard with analytics and metrics',
};
