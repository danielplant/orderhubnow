/**
 * Raw SKU Preview Page
 *
 * Shows SKUs from RawSkusFromShopify that match a specific raw Shopify collection value.
 * These are staging data - SKUs that haven't been mapped to an OHN collection yet.
 */

import Link from 'next/link'
import Image from 'next/image'
import { getRawSkusByCollectionValue } from '@/lib/data/queries/collections'
import { Button } from '@/components/ui'
import { ArrowLeft, AlertTriangle, Package } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PreviewPageProps {
  searchParams: Promise<{
    rawValue?: string
    page?: string
    pageSize?: string
  }>
}

export default async function RawSkuPreviewPage({ searchParams }: PreviewPageProps) {
  const params = await searchParams
  const rawValue = params.rawValue

  if (!rawValue) {
    return (
      <main className="p-10 bg-muted/30 min-h-screen">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/collections/mapping">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Mapping
            </Button>
          </Link>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">No raw value specified.</p>
        </div>
      </main>
    )
  }

  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(100, Math.max(10, Number(params.pageSize) || 50))
  const offset = (page - 1) * pageSize

  const { skus, total } = await getRawSkusByCollectionValue(rawValue, pageSize, offset)
  const totalPages = Math.ceil(total / pageSize)

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      {/* Header with back navigation */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/collections/mapping">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Mapping
          </Button>
        </Link>
        <h2 className="text-3xl font-bold">Raw SKU Preview</h2>
      </div>

      {/* Raw value display */}
      <div className="mb-6 p-4 bg-background border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <span className="text-sm text-muted-foreground">Shopify Collection Value:</span>
            <code className="ml-2 text-sm bg-muted px-2 py-1 rounded font-mono">
              {rawValue}
            </code>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200">
          <strong>These {total} SKUs are from raw Shopify data.</strong>
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            They are not visible to buyers until this value is mapped to an OHN collection.
          </p>
        </div>
      </div>

      {/* SKU Table */}
      <div className="bg-background border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">
                  Image
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">
                  Size
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">
                  Qty
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">
                  Price (CAD)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {skus.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No SKUs found for this value
                  </td>
                </tr>
              ) : (
                skus.map((sku, index) => (
                  <tr key={`${sku.skuId}-${index}`} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="w-12 h-12 relative bg-muted rounded overflow-hidden flex-shrink-0">
                        {sku.imageUrl ? (
                          <Image
                            src={sku.imageUrl}
                            alt={sku.displayName}
                            fill
                            className="object-contain"
                            sizes="48px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-sm font-mono">{sku.skuId}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">{sku.displayName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {sku.productType || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">{sku.size || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm tabular-nums font-medium">{sku.quantity}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {sku.priceCAD ? `$${sku.priceCAD}` : '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <div className="text-sm text-muted-foreground">
              Showing {offset + 1} - {Math.min(offset + pageSize, total)} of {total} SKUs
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/collections/mapping/preview?rawValue=${encodeURIComponent(rawValue)}&page=${page - 1}&pageSize=${pageSize}`}
                >
                  <Button variant="outline" size="sm">
                    Previous
                  </Button>
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/collections/mapping/preview?rawValue=${encodeURIComponent(rawValue)}&page=${page + 1}&pageSize=${pageSize}`}
                >
                  <Button variant="outline" size="sm">
                    Next
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
