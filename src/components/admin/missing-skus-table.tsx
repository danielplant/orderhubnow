'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DataTable,
  type DataTableColumn,
  Button,
  StatusBadge,
  SearchInput,
} from '@/components/ui'
import { BulkActionsBar } from '@/components/admin/bulk-actions-bar'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/format'
import type { MissingShopifySku, MissingSkusResult } from '@/lib/types/shopify'
import { ignoreMissingSku, bulkIgnoreMissingSkus } from '@/lib/data/actions/shopify'
import { Check, X } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface MissingSkusTableProps {
  initialData: MissingShopifySku[]
  total: number
  statusCounts: MissingSkusResult['statusCounts']
  categories: Array<{ id: number; name: string }>
}

// ============================================================================
// Status Tabs
// ============================================================================

const STATUS_TABS: Array<{ label: string; value: 'all' | 'pending' | 'reviewed' }> = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Reviewed', value: 'reviewed' },
]

// ============================================================================
// Component
// ============================================================================

export function MissingSkusTable({
  initialData,
  total,
  statusCounts,
}: MissingSkusTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isLoading, setIsLoading] = React.useState(false)

  // Parse URL params
  const status = (searchParams.get('status') || 'pending') as 'all' | 'pending' | 'reviewed'
  const search = searchParams.get('q') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = 50

  // URL param helpers
  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
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

  // Actions
  const handleIgnore = React.useCallback(
    async (id: string) => {
      setIsLoading(true)
      try {
        const result = await ignoreMissingSku(id)
        if (!result.success) {
          console.error('Failed to ignore:', result.error)
        }
        router.refresh()
      } finally {
        setIsLoading(false)
      }
    },
    [router]
  )

  const handleBulkIgnore = React.useCallback(async () => {
    if (selectedIds.length === 0) return
    setIsLoading(true)
    try {
      const result = await bulkIgnoreMissingSkus(selectedIds)
      if (!result.success) {
        console.error('Failed to bulk ignore:', result.error)
      }
      setSelectedIds([])
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }, [selectedIds, router])

  // Table columns
  const columns = React.useMemo<Array<DataTableColumn<MissingShopifySku>>>(
    () => [
      {
        id: 'skuId',
        header: 'SKU ID',
        cell: (row) => <span className="font-medium font-mono text-sm">{row.skuId}</span>,
      },
      {
        id: 'description',
        header: 'Description',
        cell: (row) => (
          <span className="text-sm text-muted-foreground line-clamp-2 max-w-[300px]">
            {row.orderEntryDescription || row.description || '—'}
          </span>
        ),
      },
      {
        id: 'skuColor',
        header: 'Color',
        cell: (row) => <span className="text-sm">{row.skuColor || '—'}</span>,
      },
      {
        id: 'priceCAD',
        header: 'Price CAD',
        cell: (row) => <span className="text-sm font-medium">{row.priceCAD || '—'}</span>,
      },
      {
        id: 'priceUSD',
        header: 'Price USD',
        cell: (row) => <span className="text-sm">{row.priceUSD || '—'}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        cell: (row) => (
          <StatusBadge status={row.isReviewed ? 'shipped' : 'pending'}>
            {row.isReviewed ? 'Reviewed' : 'Pending'}
          </StatusBadge>
        ),
      },
      {
        id: 'dateAdded',
        header: 'Discovered',
        cell: (row) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.dateAdded)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: (row) => (
          <div className="flex items-center gap-2">
            {!row.isReviewed && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleIgnore(row.id)}
                  disabled={isLoading}
                  title="Mark as reviewed (ignore)"
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
            {row.isReviewed && (
              <Check className="h-4 w-4 text-success" />
            )}
          </div>
        ),
      },
    ],
    [handleIgnore, isLoading]
  )

  // Bulk actions
  const bulkActions = React.useMemo(
    () =>
      selectedIds.length > 0
        ? [
            {
              label: 'Mark as Reviewed',
              onClick: handleBulkIgnore,
            },
          ]
        : [],
    [selectedIds.length, handleBulkIgnore]
  )

  return (
    <div className="space-y-4">
      {/* Tabs + Filters Container */}
      <div className="rounded-md border border-border bg-background">
        {/* Status Tabs */}
        <div className="flex gap-6 overflow-x-auto border-b border-border px-4">
          {STATUS_TABS.map((t) => {
            const active = status === t.value
            const count = statusCounts[t.value] ?? 0
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setParam('status', t.value === 'pending' ? null : t.value)}
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
        <div className="flex flex-wrap gap-3 p-4">
          <SearchInput
            value={search}
            onValueChange={(v) => setParam('q', v || null)}
            placeholder="Search SKU, description, color..."
            className="h-10 w-full max-w-md"
          />
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <BulkActionsBar
          count={selectedIds.length}
          actions={bulkActions}
          onClear={() => setSelectedIds([])}
        />
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="text-sm text-muted-foreground">Processing...</div>
      )}

      {/* Data Table */}
      <DataTable
        data={initialData}
        columns={columns}
        getRowId={(row) => row.id}
        enableRowSelection
        onSelectionChange={setSelectedIds}
        pageSize={pageSize}
        manualPagination
        page={page}
        totalCount={total}
        onPageChange={setPageParam}
      />
    </div>
  )
}
