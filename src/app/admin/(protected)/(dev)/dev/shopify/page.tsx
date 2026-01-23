import { getSyncStatus, getSyncHistory } from '@/lib/data/queries/shopify'
import { ShopifyStatusCard } from '@/components/admin/shopify-status-card'
import { SyncHistoryList } from '@/components/admin/sync-history-list'

export const dynamic = 'force-dynamic'

// ============================================================================
// DEPRECATED: MissingShopifySkus table is legacy (populated by old .NET sync).
// OHN never inserts new records here. Missing/inactive SKUs are now shown
// in real-time during transfer validation on the Orders page.
// The imports and components below are kept for reference; can be removed
// entirely once confirmed stable.
// ============================================================================
// import { Suspense } from 'react'
// import Link from 'next/link'
// import { getMissingSkus } from '@/lib/data/queries/shopify'
// import { prisma } from '@/lib/prisma'
// import { MissingSkusTable } from '@/components/admin/missing-skus-table'
//
// interface ShopifyPageProps {
//   searchParams: Promise<{
//     status?: string
//     q?: string
//     page?: string
//   }>
// }
//
// async function MissingSkusTab({
//   status,
//   search,
//   page,
// }: {
//   status: 'all' | 'pending' | 'reviewed'
//   search: string
//   page: number
// }) {
//   const [result, categories] = await Promise.all([
//     getMissingSkus({ status, search }, page, 50),
//     prisma.skuCategories.findMany({
//       select: { ID: true, Name: true },
//       orderBy: { Name: 'asc' },
//     }),
//   ])
//
//   return (
//     <MissingSkusTable
//       initialData={result.skus}
//       total={result.total}
//       statusCounts={result.statusCounts}
//       categories={categories.map((c) => ({ id: c.ID, name: c.Name }))}
//     />
//   )
// }


// ============================================================================
// Main Page
// ============================================================================

export default async function ShopifyPage() {
  // Get sync status and history
  const [syncStatus, syncHistory] = await Promise.all([
    getSyncStatus(),
    getSyncHistory(5),
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

      {/* 
        DEPRECATED: Missing SKUs Section
        The MissingShopifySkus table was populated by legacy .NET sync.
        OHN never inserts new records. Missing/inactive SKUs are now shown
        in real-time during transfer validation on the Orders page.
        
        See commented code above for original implementation.
      */}
    </main>
  )
}
