'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type DataTableColumn, Button, SearchInput } from '@/components/ui'
import { InlineEdit } from '@/components/ui/inline-edit'
import type { InventoryListItem } from '@/lib/data/queries/inventory'
import { updateInventoryQuantity, updateInventoryOnRoute } from '@/lib/data/actions/inventory'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/format'
import { AlertTriangle } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface InventoryTableProps {
  initialItems: InventoryListItem[]
  total: number
  statusCounts: { all: number; low: number; out: number; onroute: number }
  lowThreshold: number
}

// ============================================================================
// Constants
// ============================================================================

const TABS = [
  { label: 'All', value: 'all' },
  { label: 'Low Stock', value: 'low' },
  { label: 'Out of Stock', value: 'out' },
  { label: 'On Route', value: 'onroute' },
] as const

// ============================================================================
// Component
// ============================================================================

export function InventoryTable({
  initialItems,
  total,
  statusCounts,
  lowThreshold,
}: InventoryTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Parse current filter state from URL
  const status = (searchParams.get('status') || 'all') as (typeof TABS)[number]['value']
  const q = searchParams.get('q') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '50')

  // URL param helpers
  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      // Reset pagination on filter changes
      if (key !== 'page') {
        params.delete('page')
      }
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const setPageParam = React.useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', String(Math.max(1, nextPage)))
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // Table columns
  const columns = React.useMemo<Array<DataTableColumn<InventoryListItem>>>(
    () => [
      {
        id: 'skuId',
        header: 'SKU',
        cell: (r) => <span className="font-medium font-mono text-sm">{r.skuId}</span>,
      },
      {
        id: 'description',
        header: 'Description',
        cell: (r) => (
          <span className="text-muted-foreground max-w-xs truncate block">
            {r.description ?? '—'}
          </span>
        ),
      },
      {
        id: 'quantity',
        header: 'Qty',
        cell: (r) => (
          <div className="flex items-center gap-2">
            <InlineEdit
              value={r.quantity}
              type="number"
              onSave={async (v) => {
                const n = Number(v)
                if (!Number.isFinite(n) || n < 0) throw new Error('Invalid quantity')
                const result = await updateInventoryQuantity({ skuId: r.skuId, newQuantity: n })
                if (!result.success) throw new Error(result.error)
                router.refresh()
              }}
            />
            {r.isLowStock && (
              <AlertTriangle className="h-4 w-4 text-warning" aria-label="Low stock" />
            )}
          </div>
        ),
      },
      {
        id: 'onRoute',
        header: 'On Route',
        cell: (r) => (
          <InlineEdit
            value={r.onRoute}
            type="number"
            onSave={async (v) => {
              const n = Number(v)
              if (!Number.isFinite(n) || n < 0) throw new Error('Invalid on-route')
              const result = await updateInventoryOnRoute({ skuId: r.skuId, onRoute: n })
              if (!result.success) throw new Error(result.error)
              router.refresh()
            }}
          />
        ),
      },
      {
        id: 'effectiveQuantity',
        header: 'Effective',
        cell: (r) => (
          <span
            className={cn(
              r.isOutOfStock
                ? 'text-muted-foreground'
                : r.isLowStock
                  ? 'text-warning'
                  : 'text-foreground'
            )}
          >
            {r.effectiveQuantity}
            {r.prepackMultiplier !== 1 && (
              <span className="text-muted-foreground ml-1">(×{r.prepackMultiplier})</span>
            )}
          </span>
        ),
      },
      {
        id: 'units',
        header: 'Units',
        cell: (r) => (
          <span
            className={cn(
              'text-sm tabular-nums',
              r.prepackMultiplier > 1 ? 'text-purple-600 font-medium' : 'text-muted-foreground'
            )}
          >
            {r.prepackMultiplier > 1 ? `${r.prepackMultiplier}pc` : '1'}
          </span>
        ),
      },
      {
        id: 'unitPrice',
        header: 'Unit Price',
        cell: (r) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {r.unitPriceCad != null
              ? `$${r.unitPriceCad.toFixed(2)}`
              : '—'}
          </span>
        ),
      },
      {
        id: 'lastUpdated',
        header: 'Last Updated',
        cell: (r) => (
          <span className="text-muted-foreground text-sm">
            {formatDate(r.lastUpdated)}
          </span>
        ),
      },
    ],
    [router]
  )

  return (
    <div className="space-y-4">
      {/* Tabs + Filters Container */}
      <div className="rounded-md border border-border bg-background">
        {/* Status Tabs */}
        <div className="flex gap-6 overflow-x-auto border-b border-border px-4">
          {TABS.map((t) => {
            const active = status === t.value
            const count = statusCounts[t.value]
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setParam('status', t.value === 'all' ? null : t.value)}
                className={cn(
                  'py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}{' '}
                <span className="text-muted-foreground font-normal">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap gap-3 p-4 items-center">
          <SearchInput
            value={q}
            onValueChange={(v) => setParam('q', v || null)}
            placeholder="Search by SKU or description..."
            className="h-10 w-full max-w-md"
          />

          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span>Low stock threshold: ≤{lowThreshold}</span>
            <Button variant="outline" size="sm" onClick={() => router.refresh()}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        data={initialItems}
        columns={columns}
        getRowId={(r) => r.skuId}
        enableRowSelection={false}
        pageSize={pageSize}
        manualPagination
        page={page}
        totalCount={total}
        onPageChange={setPageParam}
      />
    </div>
  )
}
