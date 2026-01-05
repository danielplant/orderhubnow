'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import {
  Button,
  DataTable,
  type DataTableColumn,
  StatusBadge,
} from '@/components/ui'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OrderStatus } from '@/lib/types/order'
import type { RepOrderRow, RepOrdersListResult } from '@/lib/data/queries/orders'
import { FileDown, FileEdit, Search, Loader2 } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface RepOrdersTableProps {
  orders: RepOrderRow[]
  total: number
  statusCounts: RepOrdersListResult['statusCounts']
}

// ============================================================================
// Constants
// ============================================================================

const ORDER_STATUS_OPTIONS: Array<{ label: string; value: 'All' | OrderStatus }> = [
  { label: 'Any', value: 'All' },
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

export function RepOrdersTable({ orders, total, statusCounts }: RepOrdersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Parse current filter state from URL
  const status = (searchParams.get('status') || 'All') as 'All' | OrderStatus
  const q = searchParams.get('q') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '50')
  const sort = searchParams.get('sort') || 'orderDate'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const [storeSearch, setStoreSearch] = React.useState(q)
  const [fromDate, setFromDate] = React.useState(dateFrom)
  const [toDate, setToDate] = React.useState(dateTo)

  // URL param helpers
  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value || value === 'All') {
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

  const handleSearch = React.useCallback(() => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())

      // Set or remove search query
      if (storeSearch.trim()) {
        params.set('q', storeSearch.trim())
      } else {
        params.delete('q')
      }

      // Set or remove date filters
      if (fromDate) {
        params.set('dateFrom', fromDate)
      } else {
        params.delete('dateFrom')
      }
      if (toDate) {
        params.set('dateTo', toDate)
      } else {
        params.delete('dateTo')
      }

      // Reset pagination
      params.delete('page')

      router.push(`?${params.toString()}`, { scroll: false })
    })
  }, [searchParams, storeSearch, fromDate, toDate, router, startTransition])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSearch()
      }
    },
    [handleSearch]
  )

  const handleStatusChange = React.useCallback(
    (value: string) => {
      setParam('status', value === 'All' ? null : value)
    },
    [setParam]
  )

  const handlePageChange = React.useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', String(Math.max(1, newPage)))
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const handleSortChange = React.useCallback(
    (newSort: { columnId: string; direction: 'asc' | 'desc' }) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('sort', newSort.columnId)
      params.set('dir', newSort.direction)
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // Define table columns
  const columns = React.useMemo<DataTableColumn<RepOrderRow>[]>(
    () => [
      {
        id: 'orderNumber',
        header: 'Order Number',
        cell: (order) => (
          <Link
            href={`/api/orders/${order.id}/pdf`}
            className="text-primary hover:underline font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            {order.orderNumber}
          </Link>
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
        id: 'buyerName',
        header: 'Buyer',
        cell: (order) => (
          <div className="flex flex-col">
            <span className="text-sm">{order.buyerName || '—'}</span>
            {order.customerEmail && (
              <a
                href={`mailto:${order.customerEmail}`}
                className="text-xs text-muted-foreground hover:text-primary"
              >
                {order.customerEmail}
              </a>
            )}
          </div>
        ),
      },
      {
        id: 'action',
        header: 'Action',
        cell: (order) =>
          order.status === 'Pending' && !order.inShopify ? (
            <Link
              href={`/buyer/my-order?editOrder=${order.id}&returnTo=/rep/orders`}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              <FileEdit className="size-4" />
              Edit
            </Link>
          ) : (
            <Link
              href={`/api/orders/${order.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              <FileDown className="size-4" />
              PDF
            </Link>
          ),
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
          <span className="text-muted-foreground text-sm">{order.category || '—'}</span>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Store Name</label>
          <Input
            placeholder="Search..."
            value={storeSearch}
            onChange={(e) => setStoreSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-48"
            aria-label="Search orders by store name"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Any" />
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
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From Date</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-36"
            aria-label="Filter orders from date"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To Date</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-36"
            aria-label="Filter orders to date"
          />
        </div>
        <Button onClick={handleSearch} disabled={isPending} className="gap-2">
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          {isPending ? 'Searching...' : 'Search'}
        </Button>

        {orders.length > 0 && (
          <Button variant="outline" asChild className="ml-auto gap-2">
            <a href={`/api/rep/orders/export?${searchParams.toString()}`}>
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
          sort={{ columnId: sort, direction: dir }}
          onSortChange={handleSortChange}
        />
      )}
    </div>
  )
}
