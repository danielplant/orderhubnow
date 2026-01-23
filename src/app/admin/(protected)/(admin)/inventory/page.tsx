import {
  getInventoryList,
  getInventoryFacets,
  type InventoryStatusFilter,
  type InventorySortField,
  type SortDirection,
} from '@/lib/data/queries/inventory'
import { InventoryTable } from '@/components/admin/inventory-table'

export const dynamic = 'force-dynamic'

// Valid sort fields for inventory list
const VALID_SORT_FIELDS: InventorySortField[] = ['sku', 'qty', 'onRoute']

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  // Parse URL params
  const status = (typeof sp.status === 'string' ? sp.status : 'all') as InventoryStatusFilter
  const q = typeof sp.q === 'string' ? sp.q : undefined
  const collectionId = typeof sp.collectionId === 'string' ? sp.collectionId : undefined
  const color = typeof sp.color === 'string' ? sp.color : undefined
  const fabric = typeof sp.fabric === 'string' ? sp.fabric : undefined
  const size = typeof sp.size === 'string' ? sp.size : undefined
  const page = typeof sp.page === 'string' ? Math.max(1, Number(sp.page) || 1) : 1
  const pageSize = typeof sp.pageSize === 'string' ? Math.max(10, Number(sp.pageSize) || 50) : 50

  // Parse sort params (with validation)
  const sortByRaw = typeof sp.sortBy === 'string' ? sp.sortBy : undefined
  const sortBy = sortByRaw && VALID_SORT_FIELDS.includes(sortByRaw as InventorySortField)
    ? (sortByRaw as InventorySortField)
    : undefined
  const sortDir: SortDirection = sp.sortDir === 'desc' ? 'desc' : 'asc'

  // Fetch inventory data and facets in parallel
  const [result, facets] = await Promise.all([
    getInventoryList(
      { status, search: q, sortBy, sortDir, collectionId, color, fabric, size },
      page,
      pageSize
    ),
    getInventoryFacets(),
  ])

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
        facets={facets}
        sortBy={sortBy}
        sortDir={sortDir}
      />
    </main>
  )
}
