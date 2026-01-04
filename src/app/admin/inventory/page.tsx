import { getInventoryList, type InventoryStatusFilter } from '@/lib/data/queries/inventory'
import { InventoryTable } from '@/components/admin/inventory-table'

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  // Parse URL params
  const status = (typeof sp.status === 'string' ? sp.status : 'all') as InventoryStatusFilter
  const q = typeof sp.q === 'string' ? sp.q : undefined
  const page = typeof sp.page === 'string' ? Math.max(1, Number(sp.page) || 1) : 1
  const pageSize = typeof sp.pageSize === 'string' ? Math.max(10, Number(sp.pageSize) || 50) : 50

  // Fetch inventory data
  const result = await getInventoryList({ status, search: q }, page, pageSize)

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="mb-6">
        <h2 className="text-4xl font-bold text-foreground">Inventory</h2>
        <p className="text-muted-foreground mt-1">
          Manage stock quantities and track on-route inventory.
        </p>
      </div>

      <InventoryTable
        initialItems={result.items}
        total={result.total}
        statusCounts={result.statusCounts}
        lowThreshold={result.lowThreshold}
      />
    </main>
  )
}
