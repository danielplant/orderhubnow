'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  type DataTableColumn,
} from '@/components/ui'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { Package, List, X, Loader2, Search } from 'lucide-react'
import type { OpenItem, OpenItemsBySkuRow } from '@/lib/data/queries/open-items'
import { bulkCancelItems } from '@/lib/data/actions/shipments'
import { toast } from 'sonner'

interface OpenItemsTableProps {
  items: OpenItem[]
  skuData: OpenItemsBySkuRow[]
  total: number
  view: string
  currentPage: number
  pageSize: number
  sortBy: string
  sortDir: 'asc' | 'desc'
  searchQuery: string
}

export function OpenItemsTable({
  items,
  skuData,
  total,
  view,
  currentPage,
  pageSize,
  sortBy,
  sortDir,
  searchQuery,
}: OpenItemsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isCancelling, setIsCancelling] = React.useState(false)
  const [localSearch, setLocalSearch] = React.useState(searchQuery)

  // URL update helper
  const updateParams = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      router.push(`/admin/open-items?${params.toString()}`)
    },
    [router, searchParams]
  )

  // Handle search submit
  const handleSearchSubmit = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      updateParams({ q: localSearch, page: '1' })
    },
    [updateParams, localSearch]
  )

  // Handle view toggle
  const handleViewChange = React.useCallback(
    (newView: string) => {
      updateParams({ view: newView, page: '1' })
    },
    [updateParams]
  )

  // Handle sort
  const handleSort = React.useCallback(
    (sort: { columnId: string; direction: 'asc' | 'desc' }) => {
      updateParams({ sort: sort.columnId, dir: sort.direction })
    },
    [updateParams]
  )

  // Handle pagination
  const handlePageChange = React.useCallback(
    (page: number) => {
      updateParams({ page: page.toString() })
    },
    [updateParams]
  )

  // Handle selection
  const handleSelectionChange = React.useCallback((ids: string[]) => {
    setSelectedIds(ids)
  }, [])

  // Handle bulk cancel
  const handleBulkCancel = async () => {
    if (selectedIds.length === 0) return

    const confirmed = window.confirm(
      `Cancel remaining units for ${selectedIds.length} line item(s)? This cannot be undone.`
    )
    if (!confirmed) return

    setIsCancelling(true)
    try {
      const result = await bulkCancelItems(selectedIds, 'Out of stock')
      if (result.success) {
        toast.success(`Cancelled ${result.cancelledCount} item(s)`)
        setSelectedIds([])
        router.refresh()
      } else {
        toast.error('Failed to cancel items', {
          description: result.error,
        })
      }
    } catch {
      toast.error('Failed to cancel items')
    } finally {
      setIsCancelling(false)
    }
  }

  // Item columns
  const itemColumns: DataTableColumn<OpenItem>[] = [
    {
      id: 'orderNumber',
      header: 'Order',
      cell: (item) => (
        <Link
          href={`/admin/orders/${item.orderId}`}
          className="font-mono text-sm text-primary hover:underline"
        >
          {item.orderNumber}
        </Link>
      ),
    },
    {
      id: 'storeName',
      header: 'Customer',
      cell: (item) => (
        <span className="text-sm truncate max-w-[200px]" title={item.storeName}>
          {item.storeName}
        </span>
      ),
    },
    {
      id: 'sku',
      header: 'SKU',
      cell: (item) => (
        <span className="font-mono text-sm">{item.sku}</span>
      ),
      sortValue: (item) => item.sku,
    },
    {
      id: 'orderedQty',
      header: 'Ordered',
      cell: (item) => item.orderedQty,
    },
    {
      id: 'shippedQty',
      header: 'Shipped',
      cell: (item) => (
        <span className="text-success">{item.shippedQty}</span>
      ),
    },
    {
      id: 'cancelledQty',
      header: 'Cancelled',
      cell: (item) => (
        <span className={cn(item.cancelledQty > 0 && 'text-destructive')}>
          {item.cancelledQty}
        </span>
      ),
    },
    {
      id: 'openQty',
      header: 'Open',
      cell: (item) => (
        <span className="font-semibold text-warning">{item.openQty}</span>
      ),
      sortValue: (item) => item.openQty,
    },
    {
      id: 'openValue',
      header: 'Value',
      cell: (item) => formatCurrency(item.openValue, 'USD'),
      sortValue: (item) => item.openValue,
    },
    {
      id: 'daysOpen',
      header: 'Days Open',
      cell: (item) => (
        <span className={cn(
          item.daysOpen > 30 && 'text-destructive font-semibold',
          item.daysOpen > 14 && item.daysOpen <= 30 && 'text-warning',
        )}>
          {item.daysOpen}
        </span>
      ),
      sortValue: (item) => item.daysOpen,
    },
  ]

  // SKU columns
  const skuColumns: DataTableColumn<OpenItemsBySkuRow>[] = [
    {
      id: 'sku',
      header: 'SKU',
      cell: (item) => (
        <span className="font-mono text-sm">{item.sku}</span>
      ),
    },
    {
      id: 'totalOpenQty',
      header: 'Total Open Qty',
      cell: (item) => (
        <span className="font-semibold text-warning">{item.totalOpenQty}</span>
      ),
    },
    {
      id: 'totalOpenValue',
      header: 'Total Value',
      cell: (item) => formatCurrency(item.totalOpenValue, 'USD'),
    },
    {
      id: 'orderCount',
      header: 'Orders',
      cell: (item) => item.orderCount,
    },
    {
      id: 'avgDaysOpen',
      header: 'Avg Days Open',
      cell: (item) => (
        <span className={cn(
          item.avgDaysOpen > 30 && 'text-destructive font-semibold',
          item.avgDaysOpen > 14 && item.avgDaysOpen <= 30 && 'text-warning',
        )}>
          {item.avgDaysOpen}
        </span>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-base font-medium">
            {view === 'sku' ? 'Open Items by SKU' : 'Open Items by Order'}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-md border">
              <Button
                variant={view === 'items' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-r-none gap-1"
                onClick={() => handleViewChange('items')}
              >
                <List className="h-4 w-4" />
                By Order
              </Button>
              <Button
                variant={view === 'sku' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-l-none gap-1"
                onClick={() => handleViewChange('sku')}
              >
                <Package className="h-4 w-4" />
                By SKU
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="relative sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search SKU..."
              className="pl-8"
            />
          </form>
          {view === 'items' && selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Cancel Selected ({selectedIds.length})
                </>
              )}
            </Button>
          )}
        </div>

        {/* Table */}
        {view === 'sku' ? (
          <DataTable
            columns={skuColumns}
            data={skuData}
            getRowId={(item) => item.sku}
            enableRowSelection={false}
          />
        ) : (
          <>
            <DataTable
              columns={itemColumns}
              data={items}
              getRowId={(item) => item.orderItemId}
              enableRowSelection
              onSelectionChange={handleSelectionChange}
              manualSorting
              sort={sortBy ? { columnId: sortBy, direction: sortDir } : null}
              onSortChange={handleSort}
              manualPagination
              page={currentPage}
              pageSize={pageSize}
              totalCount={total}
              onPageChange={handlePageChange}
            />
          </>
        )}

        {/* Empty state */}
        {items.length === 0 && view === 'items' && (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">No Open Items</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? `No open items matching "${searchQuery}"`
                : 'All orders are fully fulfilled'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
