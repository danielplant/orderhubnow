'use client'

import * as React from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

interface ShopifyInventoryPopoverProps {
  sku: string
  children: React.ReactNode
}

interface ShopifyData {
  sku: string
  displayName: string | null
  onHand: number | null
  committed: number | null
  incoming: number | null
}

export function ShopifyInventoryPopover({ sku, children }: ShopifyInventoryPopoverProps) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<ShopifyData | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open && !data && !loading) {
      setLoading(true)
      setError(null)
      fetch(`/api/diagnostics/shopify?sku=${encodeURIComponent(sku)}`)
        .then((res) => res.json())
        .then(setData)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [open, sku, data, loading])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-right tabular-nums font-medium cursor-pointer hover:underline">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Shopify (live)</div>
        {loading && <div className="text-sm text-muted-foreground">Loading...</div>}
        {error && <div className="text-sm text-red-500">{error}</div>}
        {data && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>On Hand</span>
              <span className="font-mono">{data.onHand ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Committed</span>
              <span className="font-mono">{data.committed ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Incoming</span>
              <span className="font-mono">{data.incoming ?? '—'}</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
