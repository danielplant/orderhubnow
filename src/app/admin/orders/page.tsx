import { getOrders, getRepsForFilter } from '@/lib/data/queries/orders'
import { OrdersTable } from '@/components/admin/orders-table'

interface OrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  // Await searchParams (Next.js 15+ requirement)
  const params = await searchParams

  // Fetch data in parallel
  const [ordersData, reps] = await Promise.all([
    getOrders(params),
    getRepsForFilter(),
  ])

  return (
    <main className="p-10 bg-muted/30">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold text-foreground">Orders</h1>
      </div>

      <OrdersTable
        initialOrders={ordersData.orders}
        total={ordersData.total}
        statusCounts={ordersData.statusCounts}
        reps={reps}
      />
    </main>
  )
}
