/**
 * Fulfillment Reports Page
 * 
 * Displays key fulfillment metrics and analytics.
 */

import { Suspense } from 'react'
import { 
  getFulfillmentMetrics, 
  getShippingVolumeByCarrier,
  getCancellationSummary,
  getOpenItemsSummary,
} from '@/lib/data/queries/fulfillment-reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Package, Truck, TrendingUp, AlertCircle, XCircle } from 'lucide-react'

export const metadata = {
  title: 'Reports | Admin',
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-full ${
            trend === 'up' ? 'bg-green-100 text-green-600' :
            trend === 'down' ? 'bg-red-100 text-red-600' :
            'bg-gray-100 text-gray-600'
          }`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

async function FulfillmentMetrics() {
  const metrics = await getFulfillmentMetrics()

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Fulfillment Rate"
        value={`${metrics.fulfillmentRate}%`}
        subtitle={`${metrics.ordersShipped} of ${metrics.totalOrders} orders shipped`}
        icon={TrendingUp}
        trend={metrics.fulfillmentRate >= 90 ? 'up' : metrics.fulfillmentRate >= 70 ? 'neutral' : 'down'}
      />
      <MetricCard
        title="Units Shipped"
        value={metrics.totalUnitsShipped.toLocaleString()}
        subtitle={`${metrics.unitsShipRate}% of ordered`}
        icon={Package}
        trend="neutral"
      />
      <MetricCard
        title="Pending Orders"
        value={metrics.ordersPending}
        subtitle={`${metrics.ordersPartiallyShipped} partially shipped`}
        icon={AlertCircle}
        trend={metrics.ordersPending > 10 ? 'down' : 'neutral'}
      />
      <MetricCard
        title="Cancelled Units"
        value={metrics.totalUnitsCancelled.toLocaleString()}
        subtitle="Total cancelled"
        icon={XCircle}
        trend={metrics.totalUnitsCancelled > 0 ? 'down' : 'neutral'}
      />
    </div>
  )
}

async function CarrierBreakdown() {
  const carriers = await getShippingVolumeByCarrier()

  if (carriers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shipping by Carrier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No shipments with tracking data yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Shipping by Carrier
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {carriers.map((carrier) => (
            <div key={carrier.carrier}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{carrier.carrier}</span>
                <span className="text-muted-foreground">
                  {carrier.shipments} shipments ({carrier.percentage}%)
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${carrier.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

async function CancellationAnalysis() {
  const summary = await getCancellationSummary()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <XCircle className="h-5 w-5" />
          Cancellation Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
            <div>
              <p className="text-sm text-red-600 font-medium">Cancellation Rate</p>
              <p className="text-2xl font-bold text-red-700">{summary.cancellationRate}%</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Cancelled</p>
              <p className="text-lg font-semibold">{summary.totalCancelled} units</p>
            </div>
          </div>

          {summary.byReason.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">By Reason</h4>
              <div className="space-y-2">
                {summary.byReason.slice(0, 5).map((item) => (
                  <div key={item.reason} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate max-w-[70%]">{item.reason}</span>
                    <span className="font-medium">{item.count} ({item.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

async function OpenItemsOverview() {
  const summary = await getOpenItemsSummary()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Open Items Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-4 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-600 font-medium">Open Units</p>
            <p className="text-2xl font-bold text-amber-700">{summary.totalOpenUnits}</p>
            <p className="text-xs text-muted-foreground">{summary.totalOpenItems} line items</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-600 font-medium">Open Value</p>
            <p className="text-2xl font-bold text-blue-700">
              ${summary.totalOpenValue.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Avg {summary.averageDaysOpen} days open</p>
          </div>
        </div>

        {summary.byStatus.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">By Status</h4>
            <div className="space-y-2">
              {summary.byStatus.map((item) => (
                <div key={item.status} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.status}</span>
                  <span className="font-medium">{item.units} units ({item.count} items)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-32 bg-gray-200 rounded-lg"></div>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fulfillment Reports</h1>
        <p className="text-muted-foreground">Key metrics and analytics for order fulfillment.</p>
      </div>

      <Suspense fallback={<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{Array(4).fill(0).map((_, i) => <LoadingSkeleton key={i} />)}</div>}>
        <FulfillmentMetrics />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<LoadingSkeleton />}>
          <CarrierBreakdown />
        </Suspense>
        <Suspense fallback={<LoadingSkeleton />}>
          <CancellationAnalysis />
        </Suspense>
      </div>

      <Suspense fallback={<LoadingSkeleton />}>
        <OpenItemsOverview />
      </Suspense>
    </div>
  )
}
