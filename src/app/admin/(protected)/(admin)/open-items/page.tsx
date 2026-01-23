/**
 * Open Items Page
 * ============================================================================
 * Shows all unfulfilled line items (open items / backorders) across orders.
 */

import { Suspense } from 'react'
import { auth } from '@/lib/auth/providers'
import { redirect } from 'next/navigation'
import { getOpenItems, getOpenItemsBySku } from '@/lib/data/queries/open-items'
import { OpenItemsTable } from '@/components/admin/open-items-table'
import { Card, CardContent } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { Package, FileText, DollarSign, Clock } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{
    view?: string
    q?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/30" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-lg border bg-muted/30" />
    </div>
  )
}

async function OpenItemsContent({ searchParams }: PageProps) {
  const params = await searchParams
  const view = params.view || 'items'
  const searchQuery = params.q || ''
  const sortBy = (params.sort || 'orderDate') as 'orderDate' | 'sku' | 'openQty' | 'openValue' | 'daysOpen'
  const sortDir = (params.dir || 'desc') as 'asc' | 'desc'
  const page = parseInt(params.page || '1', 10)
  const pageSize = 50

  const [itemsResult, skuData] = await Promise.all([
    getOpenItems({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      sortBy,
      sortDir,
      searchQuery,
    }),
    getOpenItemsBySku(),
  ])

  const { items, summary } = itemsResult

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open Units</p>
                <p className="text-2xl font-bold">{summary.totalOpenUnits.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-success/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open Value</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.totalOpenValue, 'USD')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-info/10 rounded-lg">
                <FileText className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Line Items</p>
                <p className="text-2xl font-bold">{summary.totalOpenItems.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-warning/10 rounded-lg">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Orders Affected</p>
                <p className="text-2xl font-bold">{summary.totalOrders}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <OpenItemsTable 
        items={items}
        skuData={skuData}
        total={summary.totalOpenItems}
        view={view}
        currentPage={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortDir={sortDir}
        searchQuery={searchQuery}
      />
    </div>
  )
}

export default async function OpenItemsPage(props: PageProps) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/admin/login')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Open Items</h1>
        <p className="text-muted-foreground">
          Track and manage unfulfilled order line items
        </p>
      </div>

      {/* Content */}
      <Suspense fallback={<LoadingSkeleton />}>
        <OpenItemsContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

export const metadata = {
  title: 'Open Items | Admin',
  description: 'Track and manage unfulfilled order line items',
}
