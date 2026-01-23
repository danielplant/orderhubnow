import Link from 'next/link'
import { getAllCollectionsGrouped, getMappingStats } from '@/lib/data/queries/collections'
import { CollectionGrid } from '@/components/admin/collections/collection-grid'
import { Button } from '@/components/ui'
import { AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const [collections, stats] = await Promise.all([
    getAllCollectionsGrouped(), // Includes hidden collections for admin
    getMappingStats(),
  ])

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-4xl font-bold">Collections</h2>
        <Link href="/admin/collections/mapping">
          <Button variant="outline">
            Shopify Mapping
            {stats.unmapped > 0 && (
              <span className="ml-2 bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full text-xs font-medium">
                {stats.unmapped}
              </span>
            )}
          </Button>
        </Link>
      </div>

      {stats.unmapped > 0 && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="text-sm">
            <strong>{stats.unmapped} unmapped values</strong> affecting{' '}
            <strong>{stats.unmappedSkuCount} SKUs</strong> (not visible to buyers).{' '}
            <Link href="/admin/collections/mapping" className="underline">
              Map them now
            </Link>
          </span>
        </div>
      )}

      <CollectionGrid
        atsCollections={collections.ats}
        preOrderCollections={collections.preOrder}
      />
    </main>
  )
}
