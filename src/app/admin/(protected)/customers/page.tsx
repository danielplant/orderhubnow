import {
  getCustomers,
  getRepNames,
  getCustomerFacets,
  type CustomerSortField,
  type SortDirection,
} from '@/lib/data/queries/customers'
import { CustomersTable } from '@/components/admin/customers-table'

export const dynamic = 'force-dynamic'

// Valid sort fields for customers list
const VALID_SORT_FIELDS: CustomerSortField[] = ['storeName', 'country', 'state', 'rep']

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  // Parse URL params
  const q = typeof sp.q === 'string' ? sp.q : undefined
  const country = typeof sp.country === 'string' ? sp.country : undefined
  const state = typeof sp.state === 'string' ? sp.state : undefined
  const repFilter = typeof sp.repFilter === 'string' ? sp.repFilter : undefined
  const page = typeof sp.page === 'string' ? Math.max(1, Number(sp.page) || 1) : 1
  const pageSize = typeof sp.pageSize === 'string' ? Math.max(10, Number(sp.pageSize) || 50) : 50

  // Parse sort params (with validation)
  const sortByRaw = typeof sp.sortBy === 'string' ? sp.sortBy : undefined
  const sortBy = sortByRaw && VALID_SORT_FIELDS.includes(sortByRaw as CustomerSortField)
    ? (sortByRaw as CustomerSortField)
    : undefined
  const sortDir: SortDirection = sp.sortDir === 'desc' ? 'desc' : 'asc'

  // Fetch data in parallel
  const [customersResult, reps, facets] = await Promise.all([
    getCustomers({
      search: q,
      page,
      pageSize,
      sortBy,
      sortDir,
      country,
      state,
      rep: repFilter,
    }),
    getRepNames(),
    getCustomerFacets(),
  ])

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="mb-6">
        <h2 className="text-4xl font-bold text-foreground">Customers</h2>
        <p className="text-muted-foreground mt-1">
          Manage customer accounts and contact information.
        </p>
      </div>

      <CustomersTable
        initialCustomers={customersResult.customers}
        total={customersResult.total}
        reps={reps}
        facets={facets}
        sortBy={sortBy}
        sortDir={sortDir}
      />
    </main>
  )
}
