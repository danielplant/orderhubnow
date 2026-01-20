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
  SearchInput,
} from '@/components/ui'
import { BulkActionsBar } from '@/components/admin/bulk-actions-bar'
import { OrderCommentsModal } from '@/components/admin/order-comments-modal'
import { ShipmentModal } from '@/components/admin/shipment-modal'
import { OrderTypeBadge } from '@/components/admin/order-type-badge'
import { OrderNotesCell } from '@/components/admin/order-notes-cell'
import { FilterChips, type FilterChip } from '@/components/admin/filter-chips'
import { ColumnVisibilityToggle, type ColumnConfig } from '@/components/admin/column-visibility-toggle'
import { TransferPreviewModal } from '@/components/admin/transfer-preview-modal'
import { BulkTransferModal } from '@/components/admin/bulk-transfer-modal'
import { cn } from '@/lib/utils'
import type { AdminOrderRow, OrderStatus, OrdersListResult } from '@/lib/types/order'
import type { ShopifyValidationResult, BulkTransferResult } from '@/lib/types/shopify'
import { bulkUpdateStatus, updateOrderStatus } from '@/lib/data/actions/orders'
import { validateOrderForShopify, transferOrderToShopify, bulkTransferOrdersToShopify } from '@/lib/data/actions/shopify'
import { MoreHorizontal, AlertTriangle, RefreshCw } from 'lucide-react'

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
  { label: 'Partially Shipped', value: 'Partially Shipped' },
  { label: 'Shipped', value: 'Shipped' },
  { label: 'Invoiced', value: 'Invoiced' },
  { label: 'Cancelled', value: 'Cancelled' },
]

const COLUMN_LABELS: Record<string, string> = {
  orderNumber: 'Order #',
  orderType: 'Type',
  storeName: 'Store',
  salesRep: 'Rep',
  collection: 'Collection',
  shipStartDate: 'Ship Window',
  orderDate: 'Order Date',
  orderAmount: 'Total',
  shippedTotal: 'Shipped',
  variance: 'Variance',
  notes: 'Notes',
  statusSync: 'Status/Sync',
  actions: 'Actions',
}

const DEFAULT_VISIBLE_COLUMNS = Object.keys(COLUMN_LABELS)
const REQUIRED_COLUMNS = ['orderNumber', 'actions']

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  orderNumber: 95,
  orderType: 75,
  storeName: 140,
  salesRep: 80,
  collection: 100,
  shipStartDate: 140,
  orderDate: 95,
  orderAmount: 85,
  shippedTotal: 85,
  variance: 85,
  notes: 110,
  statusSync: 115,
  actions: 50,
}

// Map OrderStatus to StatusBadge status prop
function getStatusBadgeStatus(status: OrderStatus) {
  switch (status) {
    case 'Cancelled':
      return 'cancelled'
    case 'Invoiced':
      return 'invoiced'
    case 'Shipped':
      return 'shipped'
    case 'Partially Shipped':
      return 'partially-shipped'
    case 'Processing':
      return 'processing'
    case 'Pending':
    default:
      return 'pending'
  }
}

// Format Shopify status nicely
function formatShopifyStatus(s: string | null) {
  if (!s) return null
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ============================================================================
// Component
// ============================================================================

export function OrdersTable({ initialOrders, total, statusCounts, reps }: OrdersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [commentsOrderId, setCommentsOrderId] = React.useState<string | null>(null)
  const [shipmentOrder, setShipmentOrder] = React.useState<AdminOrderRow | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  // Transfer preview modal state
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewOrderId, setPreviewOrderId] = React.useState<string | null>(null)
  const [validationLoading, setValidationLoading] = React.useState(false)
  const [validationResult, setValidationResult] = React.useState<ShopifyValidationResult | null>(null)
  const [isTransferring, setIsTransferring] = React.useState(false)

  // Bulk transfer modal state
  const [bulkModalOpen, setBulkModalOpen] = React.useState(false)
  const [bulkTransferResult, setBulkTransferResult] = React.useState<BulkTransferResult | null>(null)
  const [isBulkTransferring, setIsBulkTransferring] = React.useState(false)

  // Column visibility state (localStorage persisted)
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS
    try {
      const saved = localStorage.getItem('orders-table-columns')
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_COLUMNS
    } catch {
      return DEFAULT_VISIBLE_COLUMNS
    }
  })

  // Column widths state (localStorage persisted)
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLUMN_WIDTHS
    try {
      const saved = localStorage.getItem('orders-table-widths')
      return saved ? JSON.parse(saved) : DEFAULT_COLUMN_WIDTHS
    } catch {
      return DEFAULT_COLUMN_WIDTHS
    }
  })

  // Persist column visibility
  React.useEffect(() => {
    localStorage.setItem('orders-table-columns', JSON.stringify(visibleColumns))
  }, [visibleColumns])

  // Persist column widths (debounced)
  const widthsRef = React.useRef(columnWidths)
  widthsRef.current = columnWidths
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      localStorage.setItem('orders-table-widths', JSON.stringify(widthsRef.current))
    }, 500)
    return () => clearTimeout(timeout)
  }, [columnWidths])

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

  const clearAllFilters = React.useCallback(() => {
    router.push('/admin/orders', { scroll: false })
  }, [router])

  // Build filter chips
  const filterChips = React.useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = []
    if (status && status !== 'All') {
      chips.push({
        key: 'status',
        label: 'Status',
        value: status,
        onRemove: () => setParam('status', null),
      })
    }
    if (rep) {
      chips.push({
        key: 'rep',
        label: 'Rep',
        value: rep,
        onRemove: () => setParam('rep', null),
      })
    }
    if (syncStatus) {
      chips.push({
        key: 'syncStatus',
        label: 'Sync',
        value: syncStatus === 'pending' ? 'Pending' : syncStatus,
        onRemove: () => setParam('syncStatus', null),
      })
    }
    if (dateFrom || dateTo) {
      chips.push({
        key: 'date',
        label: 'Date',
        value: `${dateFrom || '...'} to ${dateTo || '...'}`,
        onRemove: () => {
          const params = new URLSearchParams(searchParams.toString())
          params.delete('dateFrom')
          params.delete('dateTo')
          params.delete('page')
          router.push(`?${params.toString()}`, { scroll: false })
        },
      })
    }
    if (q) {
      chips.push({
        key: 'search',
        label: 'Search',
        value: q,
        onRemove: () => setParam('q', null),
      })
    }
    return chips
  }, [status, rep, syncStatus, dateFrom, dateTo, q, setParam, searchParams, router])

  // Column visibility config
  const columnConfig = React.useMemo<ColumnConfig[]>(
    () =>
      Object.entries(COLUMN_LABELS).map(([id, label]) => ({
        id,
        label,
        visible: visibleColumns.includes(id),
        required: REQUIRED_COLUMNS.includes(id),
      })),
    [visibleColumns]
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

  // Transfer handlers
  const handleValidateOrder = React.useCallback(async (orderId: string) => {
    setPreviewOrderId(orderId)
    setPreviewOpen(true)
    setValidationLoading(true)
    setValidationResult(null)

    try {
      const result = await validateOrderForShopify(orderId)
      setValidationResult(result)
    } catch (error) {
      console.error('Validation failed:', error)
    } finally {
      setValidationLoading(false)
    }
  }, [])

  const handleTransfer = React.useCallback(async () => {
    if (!previewOrderId) return

    setIsTransferring(true)
    try {
      const result = await transferOrderToShopify(previewOrderId)
      if (result.success) {
        setPreviewOpen(false)
        router.refresh()
      } else {
        // Show error in the validation result
        setValidationResult((prev) =>
          prev ? { ...prev, valid: false, missingSkus: result.missingSkus ?? [] } : null
        )
      }
    } catch (error) {
      console.error('Transfer failed:', error)
    } finally {
      setIsTransferring(false)
    }
  }, [previewOrderId, router])

  // Calculate eligible orders for bulk transfer
  const eligibleForTransfer = React.useMemo(
    () =>
      initialOrders.filter(
        (o) => selectedIds.includes(o.id) && !o.inShopify && o.status !== 'Draft'
      ),
    [initialOrders, selectedIds]
  )

  const ineligibleReasons = React.useMemo(() => {
    const reasons: Array<{ reason: string; count: number }> = []
    const selected = initialOrders.filter((o) => selectedIds.includes(o.id))
    const alreadySynced = selected.filter((o) => o.inShopify).length
    const drafts = selected.filter((o) => o.status === 'Draft').length
    if (alreadySynced > 0) reasons.push({ reason: 'already in Shopify', count: alreadySynced })
    if (drafts > 0) reasons.push({ reason: 'Draft status', count: drafts })
    return reasons
  }, [initialOrders, selectedIds])

  const handleBulkTransfer = React.useCallback(async () => {
    const eligibleIds = eligibleForTransfer.map((o) => o.id)
    if (eligibleIds.length === 0) return

    setIsBulkTransferring(true)
    try {
      const result = await bulkTransferOrdersToShopify(eligibleIds)
      setBulkTransferResult(result)
      if (result.success > 0) {
        setSelectedIds([])
        router.refresh()
      }
    } catch (error) {
      console.error('Bulk transfer failed:', error)
    } finally {
      setIsBulkTransferring(false)
    }
  }, [eligibleForTransfer, router])

  const doExport = React.useCallback(
    (format: 'detail' | 'summary' | 'qb') => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('format', format)
      if (format === 'qb' && selectedIds.length > 0) {
        params.set('ids', selectedIds.join(','))
      }
      window.location.href = `/api/orders/export?${params.toString()}`
    },
    [searchParams, selectedIds]
  )

  // Column width change handler
  const handleColumnWidthChange = React.useCallback((columnId: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [columnId]: width }))
  }, [])

  // Column visibility change handlers
  const handleColumnVisibilityChange = React.useCallback((columnId: string, visible: boolean) => {
    setVisibleColumns((prev) =>
      visible ? [...prev, columnId] : prev.filter((id) => id !== columnId)
    )
  }, [])

  const handleResetColumns = React.useCallback(() => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
    setColumnWidths(DEFAULT_COLUMN_WIDTHS)
  }, [])

  // Table columns
  const allColumns = React.useMemo<Array<DataTableColumn<AdminOrderRow>>>(
    () => [
      {
        id: 'orderNumber',
        header: 'Order #',
        minWidth: 80,
        cell: (o) => (
          <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
            {o.orderNumber}
          </Link>
        ),
      },
      {
        id: 'orderType',
        header: 'Type',
        minWidth: 60,
        cell: (o) => <OrderTypeBadge orderNumber={o.orderNumber} />,
      },
      {
        id: 'storeName',
        header: 'Store',
        minWidth: 100,
        cell: (o) => <span className="truncate">{o.storeName}</span>,
      },
      {
        id: 'salesRep',
        header: 'Rep',
        minWidth: 60,
        cell: (o) => <span className="text-muted-foreground">{o.salesRep || '—'}</span>,
      },
      {
        id: 'collection',
        header: 'Collection',
        minWidth: 80,
        cell: (o) => (
          <span className="text-sm text-muted-foreground truncate">
            {o.collection || '—'}
          </span>
        ),
      },
      {
        id: 'shipStartDate',
        header: 'Ship Window',
        minWidth: 100,
        cell: (o) => (
          <span className="text-muted-foreground text-xs">
            {o.shipStartDate && o.shipEndDate ? `${o.shipStartDate} – ${o.shipEndDate}` : '—'}
          </span>
        ),
      },
      {
        id: 'orderDate',
        header: 'Order Date',
        minWidth: 80,
        cell: (o) => <span className="text-muted-foreground text-xs">{o.orderDate}</span>,
      },
      {
        id: 'orderAmount',
        header: 'Total',
        minWidth: 70,
        cell: (o) => <span className="font-medium">{o.orderAmountFormatted}</span>,
      },
      {
        id: 'shippedTotal',
        header: 'Shipped',
        minWidth: 70,
        cell: (o) => <span className="font-medium">{o.shippedTotalFormatted ?? '—'}</span>,
      },
      {
        id: 'variance',
        header: 'Variance',
        minWidth: 70,
        cell: (o) => {
          if (o.variance === null) {
            return <span className="text-muted-foreground">—</span>
          }
          const isNegative = o.variance < 0
          const isPositive = o.variance > 0
          return (
            <span
              className={cn(
                'font-medium',
                isNegative && 'text-destructive',
                isPositive && 'text-success',
                !isNegative && !isPositive && 'text-muted-foreground'
              )}
            >
              {o.varianceFormatted}
            </span>
          )
        },
      },
      {
        id: 'notes',
        header: 'Notes',
        minWidth: 80,
        cell: (o) => (
          <OrderNotesCell
            orderId={o.id}
            initialNotes={o.notes}
            onUpdate={() => router.refresh()}
          />
        ),
      },
      {
        id: 'statusSync',
        header: 'Status/Sync',
        minWidth: 90,
        cell: (o) => (
          <div className="flex flex-col gap-1">
            {/* Order Status */}
            <StatusBadge status={getStatusBadgeStatus(o.status)} className="text-xs">
              {o.status}
            </StatusBadge>

            {/* Sync Status / Action */}
            {o.status === 'Draft' ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : o.syncError ? (
              <button
                type="button"
                onClick={() => handleValidateOrder(o.id)}
                className="flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <AlertTriangle className="h-3 w-3" />
                Failed
                <RefreshCw className="h-3 w-3 ml-0.5" />
              </button>
            ) : !o.inShopify ? (
              <button
                type="button"
                onClick={() => handleValidateOrder(o.id)}
                className="text-xs text-primary hover:underline font-medium"
              >
                Transfer →
              </button>
            ) : (
              <div className="text-xs space-y-0.5">
                <div className={o.shopifyFulfillmentStatus === 'fulfilled' ? 'text-success' : 'text-muted-foreground'}>
                  ✓ {formatShopifyStatus(o.shopifyFulfillmentStatus) || 'Unfulfilled'}
                </div>
                <div className={o.shopifyFinancialStatus === 'paid' ? 'text-success' : 'text-muted-foreground'}>
                  {formatShopifyStatus(o.shopifyFinancialStatus) || '—'}
                </div>
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        minWidth: 40,
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
              {o.status === 'Pending' && !o.inShopify && (
                <DropdownMenuItem asChild>
                  <Link href={`/buyer/my-order?editOrder=${o.id}&returnTo=/admin/orders`}>
                    Edit Items
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setCommentsOrderId(o.id)}>
                Comments
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShipmentOrder(o)}
                disabled={o.status === 'Cancelled' || o.status === 'Invoiced'}
              >
                Create Shipment
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
    [handleStatusChange, handleValidateOrder, router]
  )

  // Filter columns by visibility
  const columns = React.useMemo(
    () => allColumns.filter((col) => visibleColumns.includes(col.id)),
    [allColumns, visibleColumns]
  )

  // Bulk actions
  const bulkActions = React.useMemo(() => {
    if (selectedIds.length === 0) return []

    const actions = [
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

    // Add bulk transfer with eligibility info
    if (eligibleForTransfer.length > 0) {
      const label =
        eligibleForTransfer.length < selectedIds.length
          ? `Transfer to Shopify (${eligibleForTransfer.length} of ${selectedIds.length})`
          : `Transfer to Shopify (${eligibleForTransfer.length})`
      actions.push({
        label,
        onClick: () => {
          setBulkTransferResult(null)
          setBulkModalOpen(true)
        },
      })
    }

    return actions
  }, [selectedIds, eligibleForTransfer, handleBulkStatusChange, doExport])

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
          <SearchInput
            value={q}
            onValueChange={(v) => setParam('q', v || null)}
            placeholder="Search store name..."
            className="h-10 w-full max-w-md"
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

          <DateRangePopover value={dateRange} onChange={handleDateRangeChange} />

          <ColumnVisibilityToggle
            columns={columnConfig}
            onChange={handleColumnVisibilityChange}
            onReset={handleResetColumns}
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

        {/* Filter Chips */}
        {filterChips.length > 0 && (
          <div className="px-4 pb-3">
            <FilterChips filters={filterChips} onClearAll={clearAllFilters} />
          </div>
        )}
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
        // Sticky header and column resizing
        stickyHeader
        maxHeight="calc(100vh - 380px)"
        enableColumnResizing
        columnWidths={columnWidths}
        onColumnWidthChange={handleColumnWidthChange}
      />

      {/* Comments Modal */}
      <OrderCommentsModal
        orderId={commentsOrderId}
        open={!!commentsOrderId}
        onOpenChange={(open) => {
          if (!open) setCommentsOrderId(null)
        }}
      />

      {/* Shipment Modal */}
      <ShipmentModal
        orderId={shipmentOrder?.id ?? null}
        orderNumber={shipmentOrder?.orderNumber ?? null}
        orderAmount={shipmentOrder?.orderAmount ?? 0}
        currency={shipmentOrder?.country?.toUpperCase().includes('US') ? 'USD' : 'CAD'}
        open={!!shipmentOrder}
        onOpenChange={(open) => {
          if (!open) setShipmentOrder(null)
        }}
      />

      {/* Transfer Preview Modal */}
      <TransferPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        validation={validationResult}
        isLoading={validationLoading}
        onTransfer={handleTransfer}
        isTransferring={isTransferring}
      />

      {/* Bulk Transfer Modal */}
      <BulkTransferModal
        open={bulkModalOpen}
        onOpenChange={setBulkModalOpen}
        selectedCount={selectedIds.length}
        eligibleCount={eligibleForTransfer.length}
        ineligibleReasons={ineligibleReasons}
        result={bulkTransferResult}
        isTransferring={isBulkTransferring}
        onTransfer={handleBulkTransfer}
      />
    </div>
  )
}
