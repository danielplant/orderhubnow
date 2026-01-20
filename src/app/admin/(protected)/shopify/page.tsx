import { Suspense } from 'react'
import Link from 'next/link'
import { getSyncStatus, getSyncHistory, getMissingSkus } from '@/lib/data/queries/shopify'
import { prisma } from '@/lib/prisma'
import { ShopifyStatusCard } from '@/components/admin/shopify-status-card'
import { SyncHistoryList } from '@/components/admin/sync-history-list'
import { MissingSkusTable } from '@/components/admin/missing-skus-table'

export const dynamic = 'force-dynamic'

// ============================================================================
// Types
// ============================================================================

interface ShopifyPageProps {
  searchParams: Promise<{
    status?: string
    q?: string
    page?: string
  }>
}

// ============================================================================
// Content Components
// ============================================================================

async function MissingSkusTab({
  status,
  search,
  page,
}: {
  status: 'all' | 'pending' | 'reviewed'
  search: string
  page: number
}) {
  const [result, categories] = await Promise.all([
    getMissingSkus({ status, search }, page, 50),
    prisma.skuCategories.findMany({
      select: { ID: true, Name: true },
      orderBy: { Name: 'asc' },
    }),
  ])

  return (
    <MissingSkusTable
      initialData={result.skus}
      total={result.total}
      statusCounts={result.statusCounts}
      categories={categories.map((c) => ({ id: c.ID, name: c.Name }))}
    />
  )
}


// ============================================================================
// Main Page
// ============================================================================

export default async function ShopifyPage({ searchParams }: ShopifyPageProps) {
  const params = await searchParams
  const status = (params.status || 'pending') as 'all' | 'pending' | 'reviewed'
  const search = params.q || ''
  const page = Number(params.page || '1')

  // Get sync status, history, and missing SKUs count
  const [syncStatus, syncHistory, missingResult] = await Promise.all([
    getSyncStatus(),
    getSyncHistory(5),
    getMissingSkus({ status: 'pending' }, 1, 1), // Just for count
  ])

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-4xl font-bold">Shopify Integration</h2>
      </div>

      {/* Status Card */}
      <ShopifyStatusCard status={syncStatus} />

      {/* Sync History */}
      {syncHistory.length > 0 && (
        <div className="rounded-lg border border-border bg-card mb-6">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-medium">Sync History</h3>
          </div>
          <SyncHistoryList history={syncHistory} />
        </div>
      )}

      {/* Missing SKUs Section */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-medium">
            Missing SKUs{' '}
            {missingResult.statusCounts.pending > 0 && (
              <span className="text-muted-foreground font-normal">
                ({missingResult.statusCounts.pending} pending)
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Order transfers now available on the{' '}
            <Link href="/admin/orders" className="text-primary hover:underline">
              Orders page
            </Link>
          </p>
        </div>
        <div className="p-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading...
              </div>
            }
          >
            <MissingSkusTab status={status} search={search} page={page} />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
