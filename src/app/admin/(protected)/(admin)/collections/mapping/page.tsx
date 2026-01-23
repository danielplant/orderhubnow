import Link from 'next/link'
import { getShopifyMappings, getMappingStats, getCollectionsWithCount } from '@/lib/data/queries/collections'
import { ShopifyMappingTable } from '@/components/admin/collections/shopify-mapping-table'
import { Button } from '@/components/ui'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ShopifyMappingPage() {
  const [mappings, stats, collections] = await Promise.all([
    getShopifyMappings(),
    getMappingStats(),
    getCollectionsWithCount(),
  ])

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/collections">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Collections
          </Button>
        </Link>
        <h2 className="text-4xl font-bold">Shopify Mapping</h2>
      </div>

      {/* Rules Panel */}
      <div className="mb-6 p-4 bg-background border border-border rounded-lg">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          How Mapping Works
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
            <span>Raw values from Shopify&apos;s <code className="bg-muted px-1 rounded">metafield_order_entry_collection</code> are stored exactly as-is</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
            <span>Comma-separated values are split - one product can appear in multiple collections</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
            <span><strong>Unmapped values = SKUs NOT visible to buyers.</strong> Map them here to make products appear</span>
          </li>
        </ul>
      </div>

      {/* Warning Banner */}
      {stats.unmapped > 0 && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <span className="text-sm">
            <strong>{stats.unmapped} unmapped values</strong> affecting{' '}
            <strong>{stats.unmappedSkuCount} SKUs</strong> (not visible to buyers)
          </span>
        </div>
      )}

      {/* Mapping Table */}
      <ShopifyMappingTable
        mappings={mappings}
        collections={collections}
        stats={stats}
      />
    </main>
  )
}
