import { Suspense } from 'react'
import { getSyncStatus, getSyncHistory, getMissingSkus, getOrdersPendingTransfer } from '@/lib/data/queries/shopify'
import { prisma } from '@/lib/prisma'
import { ShopifyStatusCard } from '@/components/admin/shopify-status-card'
import { SyncHistoryList } from '@/components/admin/sync-history-list'
import { MissingSkusTable } from '@/components/admin/missing-skus-table'
import { OrdersPendingTransferTableClient } from '@/components/admin/orders-pending-transfer-client'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ============================================================================
// Types
// ============================================================================

interface ShopifyPageProps {
  searchParams: Promise<{
    tab?: string
    status?: string
    q?: string
    page?: string
  }>
}

// ============================================================================
// Tab Content Components
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

async function OrdersPendingTab({ page }: { page: number }) {
  const result = await getOrdersPendingTransfer(page, 50)

  // Serialize dates for client component
  const serializedOrders = result.orders.map((o) => ({
    ...o,
    orderDate: o.orderDate.toISOString(),
  }))

  return (
    <OrdersPendingTransferTableClient
      orders={serializedOrders}
      total={result.total}
      page={page}
    />
  )
}

// ============================================================================
// Tab Navigation
// ============================================================================

type TabValue = 'missing' | 'transfer'

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: 'missing', label: 'Missing SKUs' },
  { value: 'transfer', label: 'Orders Pending Transfer' },
]

function TabNavigation({
  activeTab,
  pendingCount,
  ordersCount,
}: {
  activeTab: TabValue
  pendingCount: number
  ordersCount: number
}) {
  return (
    <div className="flex gap-6 overflow-x-auto border-b border-border px-4 bg-background rounded-t-md">
      {TABS.map((tab) => {
        const active = activeTab === tab.value
        const count = tab.value === 'missing' ? pendingCount : ordersCount

        return (
          <a
            key={tab.value}
            href={`?tab=${tab.value}`}
            className={cn(
              'py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}{' '}
            {count > 0 && (
              <span
                className={cn(
                  'font-normal',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                ({count})
              </span>
            )}
          </a>
        )
      })}
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default async function ShopifyPage({ searchParams }: ShopifyPageProps) {
  const params = await searchParams
  const tab = (params.tab || 'missing') as TabValue
  const status = (params.status || 'pending') as 'all' | 'pending' | 'reviewed'
  const search = params.q || ''
  const page = Number(params.page || '1')

  // Get sync status, history, and counts
  const [syncStatus, syncHistory, missingResult, ordersResult] = await Promise.all([
    getSyncStatus(),
    getSyncHistory(5),
    getMissingSkus({ status: 'pending' }, 1, 1), // Just for count
    getOrdersPendingTransfer(1, 1), // Just for count
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

      {/* Tab Navigation */}
      <TabNavigation
        activeTab={tab}
        pendingCount={missingResult.statusCounts.pending}
        ordersCount={ordersResult.total}
      />

      {/* Tab Content */}
      <div className="rounded-b-md border border-t-0 border-border bg-background p-6">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading...
            </div>
          }
        >
          {tab === 'missing' && (
            <MissingSkusTab status={status} search={search} page={page} />
          )}
          {tab === 'transfer' && <OrdersPendingTab page={page} />}
        </Suspense>
      </div>
    </main>
  )
}
