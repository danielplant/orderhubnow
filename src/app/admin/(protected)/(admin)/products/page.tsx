/**
 * Admin Products Page
 * Server component that fetches data and renders ProductsTable
 * Replaces the mock client page
 */

import { getProducts, getCollectionsForFilter } from '@/lib/data/queries/products'
import { getAvailabilitySettings } from '@/lib/data/queries/availability-settings'
import { ProductsTable } from '@/components/admin/products-table'

export const dynamic = 'force-dynamic'

interface ProductsPageProps {
  searchParams: Promise<{
    tab?: string
    q?: string
    collectionId?: string
    sort?: string
    dir?: string
    page?: string
    pageSize?: string
  }>
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams

  // Fetch data in parallel
  const availabilitySettings = await getAvailabilitySettings()
  const [productsResult, collections] = await Promise.all([
    getProducts(params, { view: 'admin_products', settings: availabilitySettings }),
    getCollectionsForFilter(),
  ])

  return (
    <main className="p-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Products</h1>
      </div>

      {/* Products Table with all filters */}
      <ProductsTable
        initialRows={productsResult.rows}
        total={productsResult.total}
        categories={collections}
        availabilitySettings={availabilitySettings}
      />
    </main>
  )
}
