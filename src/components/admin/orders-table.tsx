'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DataTable,
  type DataTableColumn,
  StatusBadge,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DateRangePopover,
  type DateRange,
} from '@/components/ui'
import { BulkActionsBar } from '@/components/admin/bulk-actions-bar'
import { OrderCommentsModal } from '@/components/admin/order-comments-modal'
import { cn } from '@/lib/utils'
import type { AdminOrderRow, OrderStatus, OrdersListResult } from '@/lib/types/order'
import { bulkUpdateStatus, updateOrderStatus } from '@/lib/data/actions/orders'
import { MoreHorizontal } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface OrdersTableProps {
  initialOrders: AdminOrderRow[]
  total: number
  statusCounts: OrdersListResult['statusCounts']
  reps: Array<{ id: string; name: string }>
}

// ============================================================================
// Constants
// ============================================================================

const ORDER_STATUS_TABS: Array<{ label: 'All' | OrderStatus; value: string }> = [
  { label: 'All', value: 'All' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Processing', value: 'Processing' },
  { label: 'Shipped', value: 'Shipped' },
  { label: 'Invoiced', value: 'Invoiced' },
  { label: 'Cancelled', value: 'Cancelled' },
]

// Map OrderStatus to StatusBadge status prop
function getStatusBadgeStatus(status: OrderStatus) {
  switch (status) {
    case 'Cancelled':
      return 'cancelled'
    case 'Invoiced':
      return 'invoiced'
    case 'Shipped':
      return 'shipped'
    case 'Processing':
      return 'processing'
    case 'Pending':
    default:
      return 'pending'
  }
}

// ============================================================================
// Component
// ============================================================================

export function OrdersTable({ initialOrders, total, statusCounts, reps }: OrdersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [commentsOrderId, setCommentsOrderId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  // Parse current filter state from URL
  const status = (searchParams.get('status') || 'All') as 'All' | OrderStatus
  const syncStatus = searchParams.get('syncStatus') || ''
  const q = searchParams.get('q') || ''
  const rep = searchParams.get('rep') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '50')
  const sort = searchParams.get('sort') || 'orderDate'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  // Date range value for the popover
  const dateRange: DateRange = {
    from: dateFrom || null,
    to: dateTo || null,
  }

  // Handler for date range changes
  const handleDateRangeChange = React.useCallback(
    (range: DateRange) => {
      const params = new URLSearchParams(searchParams.toString())
      if (range.from) {
        params.set('dateFrom', range.from)
      } else {
        params.delete('dateFrom')
      }
      if (range.to) {
        params.set('dateTo', range.to)
      } else {
        params.delete('dateTo')
      }
      // Reset pagination on filter changes
      params.delete('page')
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

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

  const setSortParam = React.useCallback(
    (newSort: { columnId: string; direction: 'asc' | 'desc' }) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('sort', newSort.columnId)
      params.set('dir', newSort.direction)
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // Actions
  const handleStatusChange = React.useCallback(
    async (orderId: string, newStatus: OrderStatus) => {
      setIsLoading(true)
      try {
        await updateOrderStatus({ orderId, newStatus })
        router.refresh()
      } finally {
        setIsLoading(false)
      }
    },
    [router]
  )

  const handleBulkStatusChange = React.useCallback(
    async (newStatus: OrderStatus) => {
      if (selectedIds.length === 0) return
      setIsLoading(true)
      try {
        await bulkUpdateStatus({ orderIds: selectedIds, newStatus })
        setSelectedIds([])
        router.refresh()
      } finally {
        setIsLoading(false)
      }
    },
    [selectedIds, router]
  )

  const doExport = React.useCallback(
    (format: 'detail' | 'summary' | 'qb') => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('format', format)
      // If we have selected orders, pass their IDs for QB export
      if (format === 'qb' && selectedIds.length > 0) {
        params.set('ids', selectedIds.join(','))
      }
      window.location.href = `/api/orders/export?${params.toString()}`
    },
    [searchParams, selectedIds]
  )

  // Table columns
  const columns = React.useMemo<Array<DataTableColumn<AdminOrderRow>>>(
    () => [
      {
        id: 'orderNumber',
        header: 'Order #',
        cell: (o) => (
          <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
            {o.orderNumber}
          </Link>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: (o) => (
          <StatusBadge status={getStatusBadgeStatus(o.status)}>{o.status}</StatusBadge>
        ),
      },
      {
        id: 'storeName',
        header: 'Store',
        cell: (o) => <span>{o.storeName}</span>,
      },
      {
        id: 'salesRep',
        header: 'Rep',
        cell: (o) => <span className="text-muted-foreground">{o.salesRep || '—'}</span>,
      },
      {
        id: 'shipStartDate',
        header: 'Ship Window',
        cell: (o) => (
          <span className="text-muted-foreground">
            {o.shipStartDate && o.shipEndDate ? `${o.shipStartDate} – ${o.shipEndDate}` : '—'}
          </span>
        ),
      },
      {
        id: 'orderDate',
        header: 'Order Date',
        cell: (o) => <span className="text-muted-foreground">{o.orderDate}</span>,
      },
      {
        id: 'orderAmount',
        header: 'Total',
        cell: (o) => <span className="font-medium">{o.orderAmountFormatted}</span>,
      },
      {
        id: 'inShopify',
        header: 'Sync',
        cell: (o) => (
          <span className={cn('text-sm', o.inShopify ? 'text-success' : 'text-warning')}>
            {o.inShopify ? 'In Shopify' : 'Pending'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: (o) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/admin/orders/${o.id}`}>View</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCommentsOrderId(o.id)}>
                Comments
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange(o.id, 'Processing')}
                disabled={o.status === 'Processing'}
              >
                Mark Processing
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange(o.id, 'Shipped')}
                disabled={o.status === 'Shipped'}
              >
                Mark Shipped
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange(o.id, 'Invoiced')}
                disabled={o.status === 'Invoiced'}
              >
                Mark Invoiced
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange(o.id, 'Cancelled')}
                disabled={o.status === 'Cancelled'}
                className="text-destructive"
              >
                Cancel Order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [handleStatusChange]
  )

  // Bulk actions
  const bulkActions = React.useMemo(
    () =>
      selectedIds.length > 0
        ? [
            {
              label: 'Mark Processing',
              onClick: () => handleBulkStatusChange('Processing'),
            },
            {
              label: 'Mark Shipped',
              onClick: () => handleBulkStatusChange('Shipped'),
            },
            {
              label: 'Export QB',
              onClick: () => doExport('qb'),
            },
          ]
        : [],
    [selectedIds.length, handleBulkStatusChange, doExport]
  )

  return (
    <div className="space-y-4">
      {/* Tabs + Filters Container */}
      <div className="rounded-md border border-border bg-background">
        {/* Status Tabs */}
        <div className="flex gap-6 overflow-x-auto border-b border-border px-4">
          {ORDER_STATUS_TABS.map((t) => {
            const active = status === t.label
            const count = statusCounts[t.label] ?? 0
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setParam('status', t.label === 'All' ? null : t.label)}
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
          <input
            data-search-input
            value={q}
            onChange={(e) => setParam('q', e.target.value || null)}
            placeholder="Search order #, store, email, buyer, or PO... (⌘K)"
            className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <select
            value={rep}
            onChange={(e) => setParam('rep', e.target.value || null)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All reps</option>
            {reps.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            value={syncStatus}
            onChange={(e) => setParam('syncStatus', e.target.value || null)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All sync status</option>
            <option value="pending">Pending sync</option>
          </select>

          <DateRangePopover
            value={dateRange}
            onChange={handleDateRangeChange}
          />

          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => doExport('detail')}>
              Export Detail
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('summary')}>
              Export Summary
            </Button>
          </div>
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
        <div className="text-sm text-muted-foreground">Updating...</div>
      )}

      {/* Data Table */}
      <DataTable
        data={initialOrders}
        columns={columns}
        getRowId={(o) => o.id}
        enableRowSelection
        onSelectionChange={setSelectedIds}
        pageSize={pageSize}
        // Manual/server-side pagination
        manualPagination
        page={page}
        totalCount={total}
        onPageChange={setPageParam}
        // Manual/server-side sorting
        manualSorting
        sort={{ columnId: sort, direction: dir }}
        onSortChange={setSortParam}
      />

      {/* Comments Modal */}
      <OrderCommentsModal
        orderId={commentsOrderId}
        open={!!commentsOrderId}
        onOpenChange={(open) => {
          if (!open) setCommentsOrderId(null)
        }}
      />
    </div>
  )
}
