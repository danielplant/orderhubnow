'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { FileDown, FileEdit } from 'lucide-react'

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

  // Parse current filter state from URL
  const status = (searchParams.get('status') || 'All') as 'All' | OrderStatus
  const q = searchParams.get('q') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '50')
  const sort = searchParams.get('sort') || 'orderDate'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const [storeSearch, setStoreSearch] = React.useState(q)

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
    setParam('q', storeSearch.trim() || null)
  }, [setParam, storeSearch])

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
        id: 'action',
        header: 'Action',
        cell: (order) =>
          order.status === 'Pending' && !order.inShopify ? (
            <Link
              href={`/buyer/my-order?editOrder=${order.id}&returnTo=/rep/orders`}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              <FileEdit className="size-4" />
              Edit Items
            </Link>
          ) : null,
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
    []
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <Input
          data-search-input
          placeholder="Search order #, store, email, buyer... (⌘K)"
          value={storeSearch}
          onChange={(e) => setStoreSearch(e.target.value)}
          onKeyDown={handleKeyDown}
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
        <Button onClick={handleSearch}>Update Orders Listing</Button>

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
