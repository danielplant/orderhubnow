/**
 * Rep Products Page
 * Server component that fetches data and renders ProductsTable in read-only mode
 */

import { getProducts, getCollectionsForFilter } from '@/lib/data/queries/products'
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

export default async function RepProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams

  // Fetch data in parallel
  const [productsResult, collections] = await Promise.all([
    getProducts(params),
    getCollectionsForFilter(),
  ])

  return (
    <main className="p-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Products</h1>
      </div>

      {/* Products Table in read-only mode */}
      <ProductsTable
        initialRows={productsResult.rows}
        total={productsResult.total}
        categories={collections}
        readOnly
      />
    </main>
  )
}
