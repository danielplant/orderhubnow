import { getOrders, getOrderFacets, getViewModeCounts } from '@/lib/data/queries/orders'
import { OrdersTable } from '@/components/admin/orders-table'
import { FulfillmentSyncIndicator } from '@/components/admin/fulfillment-sync-indicator'
import { getFulfillmentSyncStatus } from '@/lib/data/actions/fulfillment-sync'

export const dynamic = 'force-dynamic'

interface OrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  // Await searchParams (Next.js 15+ requirement)
  const params = await searchParams

  // Fetch data in parallel
  const [ordersData, facets, syncStatus, viewModeCounts] = await Promise.all([
    getOrders(params),
    getOrderFacets(),
    getFulfillmentSyncStatus(),
    getViewModeCounts(),
  ])

  return (
    <main className="p-10 bg-muted/30">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold text-foreground">Orders</h1>
        <FulfillmentSyncIndicator
          lastSyncedAt={syncStatus.lastSyncedAt}
          pendingOrdersCount={syncStatus.pendingOrdersCount}
        />
      </div>

      <OrdersTable
        initialOrders={ordersData.orders}
        total={ordersData.total}
        statusCounts={ordersData.statusCounts}
        facets={facets}
        viewModeCounts={viewModeCounts}
      />
    </main>
  )
}
