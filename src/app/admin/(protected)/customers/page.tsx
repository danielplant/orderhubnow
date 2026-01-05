import { getCustomers, getRepNames } from '@/lib/data/queries/customers'
import { CustomersTable } from '@/components/admin/customers-table'

export const dynamic = 'force-dynamic'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  // Parse URL params
  const q = typeof sp.q === 'string' ? sp.q : undefined
  const page = typeof sp.page === 'string' ? Math.max(1, Number(sp.page) || 1) : 1
  const pageSize = typeof sp.pageSize === 'string' ? Math.max(10, Number(sp.pageSize) || 50) : 50

  // Fetch data in parallel
  const [customersResult, reps] = await Promise.all([
    getCustomers({ search: q, page, pageSize }),
    getRepNames(),
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
      />
    </main>
  )
}
