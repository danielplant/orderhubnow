'use client'

import * as React from 'react'
import Link from 'next/link'
import { useTableSearch } from '@/lib/hooks'
import {
  Button,
  DataTable,
  type DataTableColumn,
  StatusBadge,
  SearchInput,
} from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OrderStatus } from '@/lib/types/order'
import type { RepOrderRow, RepOrdersListResult } from '@/lib/data/queries/orders'
import { FileDown, FileEdit, Copy, Check, Share2 } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface RepOrdersTableProps {
  orders: RepOrderRow[]
  total: number
  statusCounts: RepOrdersListResult['statusCounts']
  repId: string
  repName?: string | null
  isReadOnly?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const ORDER_STATUS_OPTIONS: Array<{ label: string; value: 'All' | OrderStatus }> = [
  { label: 'Any', value: 'All' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Processing', value: 'Processing' },
  { label: 'Partially Shipped', value: 'Partially Shipped' },
  { label: 'Shipped', value: 'Shipped' },
  { label: 'Invoiced', value: 'Invoiced' },
  { label: 'Cancelled', value: 'Cancelled' },
]

// Map OrderStatus to StatusBadge status prop
function getStatusBadgeStatus(status: OrderStatus) {
  switch (status) {
    case 'Draft':
      return 'draft'
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

// ============================================================================
// Component
// ============================================================================

export function RepOrdersTable({
  orders,
  total,
  statusCounts,
  repId,
  repName,
  isReadOnly = false,
}: RepOrdersTableProps) {
  // Use shared table search hook
  const { q, page, pageSize, sort, dir, setParam, setPage, setSort, getParam } = useTableSearch()

  // Additional URL params - default sort for orders is orderDate
  const actualSort = sort || 'orderDate'
  const status = (getParam('status') || 'All') as 'All' | OrderStatus

  // Build search params for export URL
  const exportParams = React.useMemo(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status !== 'All') params.set('status', status)
    if (sort) params.set('sort', sort)
    if (dir) params.set('dir', dir)
    params.set('repId', repId)
    return params.toString()
  }, [q, status, sort, dir, repId])

  const handleStatusChange = React.useCallback(
    (value: string) => {
      setParam('status', value === 'All' ? null : value)
    },
    [setParam]
  )

  const handlePageChange = React.useCallback(
    (newPage: number) => {
      setPage(newPage)
    },
    [setPage]
  )

  const handleSortChange = React.useCallback(
    (newSort: { columnId: string; direction: 'asc' | 'desc' }) => {
      setSort(newSort)
    },
    [setSort]
  )

  // State for copy link feedback
  const [copiedOrderNumber, setCopiedOrderNumber] = React.useState<string | null>(null)

  // Copy draft link to clipboard
  const copyDraftLink = React.useCallback(async (orderNumber: string) => {
    const url = `${window.location.origin}/draft/${orderNumber}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedOrderNumber(orderNumber)
      setTimeout(() => setCopiedOrderNumber(null), 2000)
    } catch (err) {
      console.error('Failed to copy draft link:', err)
    }
  }, [])

  // State for copied submitted order feedback
  const [copiedSubmittedOrder, setCopiedSubmittedOrder] = React.useState<string | null>(null)

  // Copy submitted order PDF link to clipboard
  const copyOrderPdfLink = React.useCallback(async (orderId: string | number) => {
    const url = `${window.location.origin}/api/orders/${orderId}/pdf`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedSubmittedOrder(String(orderId))
      setTimeout(() => setCopiedSubmittedOrder(null), 2000)
    } catch (err) {
      console.error('Failed to copy order link:', err)
    }
  }, [])

  // Define table columns
  const buildEditHref = React.useCallback(
    (orderId: string) => {
      const params = new URLSearchParams({ editOrder: orderId, returnTo: '/rep/orders', repId })
      if (repName) params.set('repName', repName)
      return `/buyer/my-order?${params.toString()}`
    },
    [repId, repName]
  )

  // Build URL for resuming a draft order
  const buildDraftHref = React.useCallback(
    (orderNumber: string) => {
      const params = new URLSearchParams({
        draft: orderNumber,
        repId,
        returnTo: '/rep/orders',
      })
      if (repName) params.set('repName', repName)
      return `/buyer/my-order?${params.toString()}`
    },
    [repId, repName]
  )

  const columns = React.useMemo<DataTableColumn<RepOrderRow>[]>(
    () => [
      {
        id: 'orderNumber',
        header: 'Order Number',
        cell: (order) => (
          <div className="flex items-center gap-1.5">
            <Link
              href={`/api/orders/${order.id}/pdf`}
              className="text-primary hover:underline font-medium"
              target="_blank"
            >
              {order.orderNumber}
            </Link>
          </div>
        ),
      },
      {
        id: 'orderDate',
        header: 'Order Date',
        cell: (order) => (
          <span className="text-muted-foreground">{order.orderDate}</span>
        ),
      },
      {
        id: 'storeName',
        header: 'Store Name',
        cell: (order) => <span>{order.storeName}</span>,
      },
      {
        id: 'action',
        header: 'Action',
        cell: (order) => {
          // Draft actions: Resume + Copy Link
          if (order.status === 'Draft') {
            return (
              <div className="flex items-center gap-2">
                <Link
                  href={buildDraftHref(order.orderNumber)}
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  <FileEdit className="size-4" />
                  Resume
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1"
                  onClick={() => copyDraftLink(order.orderNumber)}
                >
                  {copiedOrderNumber === order.orderNumber ? (
                    <>
                      <Check className="size-3.5 text-green-600" />
                      <span className="text-green-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </Button>
              </div>
            )
          }
          
          // Submitted order actions
          return (
            <div className="flex items-center gap-2">
              {/* Edit Items - only for Pending orders not in Shopify */}
              {!isReadOnly && order.status === 'Pending' && !order.inShopify && (
                <Link
                  href={buildEditHref(String(order.id))}
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  <FileEdit className="size-4" />
                  Edit
                </Link>
              )}
              
              {/* Share PDF Link - for all submitted orders */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1"
                onClick={() => copyOrderPdfLink(order.id)}
              >
                {copiedSubmittedOrder === String(order.id) ? (
                  <>
                    <Check className="size-3.5 text-green-600" />
                    <span className="text-green-600">Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="size-3.5" />
                    <span>Share</span>
                  </>
                )}
              </Button>
            </div>
          )
        },
      },
      {
        id: 'salesRep',
        header: 'Sales Rep',
        cell: (order) => (
          <span className="text-muted-foreground">{order.salesRep}</span>
        ),
      },
      {
        id: 'orderAmount',
        header: 'Order Total',
        cell: (order) => (
          <span className="font-medium">{order.orderAmountFormatted}</span>
        ),
      },
      {
        id: 'shipStartDate',
        header: 'Ship Window',
        cell: (order) => (
          <span className="text-muted-foreground">
            {order.shipStartDate && order.shipEndDate
              ? `${order.shipStartDate} – ${order.shipEndDate}`
              : '—'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Order Status',
        cell: (order) => (
          <StatusBadge status={getStatusBadgeStatus(order.status)}>
            {order.status}
          </StatusBadge>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        cell: (order) => (
          <span className="text-muted-foreground text-sm">{order.category}</span>
        ),
      },
    ],
    [buildEditHref, buildDraftHref, copyDraftLink, copiedOrderNumber, copyOrderPdfLink, copiedSubmittedOrder, isReadOnly]
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <SearchInput
          placeholder="Search order #, store name..."
          value={q}
          onValueChange={(v) => setParam('q', v || null)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Order Status" />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
                {opt.value !== 'All' && ` (${statusCounts[opt.value]})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isReadOnly && orders.length > 0 && (
          <Button variant="outline" asChild className="ml-auto gap-2">
            <a href={`/api/rep/orders/export?${exportParams}`}>
              <FileDown className="size-4" />
              Export to Excel
            </a>
          </Button>
        )}
      </div>

      {/* Table */}
      {orders.length === 0 ? (
        <div className="rounded-md border bg-background p-12 text-center text-muted-foreground">
          No Orders Found
        </div>
      ) : (
        <DataTable
          data={orders}
          columns={columns}
          getRowId={(order) => order.id}
          pageSize={pageSize}
          enableRowSelection={false}
          manualPagination
          page={page}
          totalCount={total}
          onPageChange={handlePageChange}
          manualSorting
          sort={{ columnId: actualSort, direction: dir }}
          onSortChange={handleSortChange}
        />
      )}
    </div>
  )
}
