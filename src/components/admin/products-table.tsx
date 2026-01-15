'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DataTable,
  type DataTableColumn,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  SearchInput,
} from '@/components/ui'
import type { CurrencyMode } from '@/lib/types/export'
import { BulkActionsBar } from '@/components/admin/bulk-actions-bar'
import { ProductDetailModal } from '@/components/admin/product-detail-modal'
import { cn } from '@/lib/utils'
import type { AdminSkuRow, CategoryForFilter } from '@/lib/types'
import {
  deleteSku,
  bulkDeleteSkus,
  setSkuPreOrderFlag,
  bulkSetPreOrderFlag,
} from '@/lib/data/actions/products'
import { UploadProductsModal } from '@/components/admin/upload-products-modal'
import { CollectionSelector, type CollectionFilterMode } from '@/components/admin/collection-selector'
import { MoreHorizontal, Download, Upload, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface ProductsTableProps {
  initialRows: AdminSkuRow[]
  total: number
  categories: CategoryForFilter[]
}

// ============================================================================
// Component
// ============================================================================

export function ProductsTable({
  initialRows,
  total,
  categories,
}: ProductsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [showUploadModal, setShowUploadModal] = React.useState(false)
  const [productModalOpen, setProductModalOpen] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedProduct, setSelectedProduct] = React.useState<any | null>(null)
  const [highlightedSku, setHighlightedSku] = React.useState<string | undefined>()
  const [exportCurrency, setExportCurrency] = React.useState<CurrencyMode>('BOTH')

  // Parse current filter state from URL
  const q = searchParams.get('q') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '50')
  const sort = searchParams.get('sort') || 'dateModified'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  // Parse collections param: 'all' | 'ats' | 'preorder' | '1,2,3'
  const collectionsParam = searchParams.get('collections') || 'all'
  const { collectionMode, selectedCollectionIds } = React.useMemo(() => {
    if (collectionsParam === 'all' || collectionsParam === 'ats' || collectionsParam === 'preorder') {
      return { collectionMode: collectionsParam as CollectionFilterMode, selectedCollectionIds: [] }
    }
    // Parse comma-separated IDs
    const ids = collectionsParam.split(',').map(Number).filter(Number.isFinite)
    return {
      collectionMode: 'specific' as CollectionFilterMode,
      selectedCollectionIds: ids
    }
  }, [collectionsParam])

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

  // Collection filter handlers
  const handleCollectionModeChange = React.useCallback(
    (mode: CollectionFilterMode) => {
      const params = new URLSearchParams(searchParams.toString())
      if (mode === 'all') {
        params.delete('collections')
      } else {
        params.set('collections', mode)
      }
      params.delete('page') // Reset pagination
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const handleCollectionSelectionChange = React.useCallback(
    (ids: number[]) => {
      const params = new URLSearchParams(searchParams.toString())
      if (ids.length === 0) {
        params.set('collections', 'specific')
      } else {
        params.set('collections', ids.join(','))
      }
      params.delete('page') // Reset pagination
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // Actions
  const handleDelete = React.useCallback(
    async (id: string) => {
      if (!confirm('Are you sure you want to delete this SKU?')) return
      setIsLoading(true)
      try {
        await deleteSku(id)
        router.refresh()
      } finally {
        setIsLoading(false)
      }
    },
    [router]
  )

  const handleTogglePreOrder = React.useCallback(
    async (id: string, currentValue: boolean | null) => {
      setIsLoading(true)
      try {
        // Toggle: if currently pre-order (true), set to ATS (false); otherwise set to pre-order (true)
        await setSkuPreOrderFlag(id, !currentValue)
        router.refresh()
      } finally {
        setIsLoading(false)
      }
    },
    [router]
  )

  const handleBulkDelete = React.useCallback(async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Delete ${selectedIds.length} SKU(s)?`)) return
    setIsLoading(true)
    try {
      await bulkDeleteSkus(selectedIds)
      setSelectedIds([])
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }, [selectedIds, router])

  const handleBulkSetPreOrder = React.useCallback(
    async (showInPreOrder: boolean) => {
      if (selectedIds.length === 0) return
      setIsLoading(true)
      try {
        await bulkSetPreOrderFlag(selectedIds, showInPreOrder)
        setSelectedIds([])
        router.refresh()
      } finally {
        setIsLoading(false)
      }
    },
    [selectedIds, router]
  )

  // Export using current filter (collections param already in URL)
  const doExport = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('currency', exportCurrency)
    window.location.href = `/api/products/export?${params.toString()}`
  }, [searchParams, exportCurrency])

  const doExportPdf = React.useCallback((orientation: 'landscape' | 'portrait') => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('currency', exportCurrency)
    params.set('orientation', orientation)
    window.location.href = `/api/products/export-pdf?${params.toString()}`
  }, [searchParams, exportCurrency])

  const handleSkuClick = React.useCallback(async (row: AdminSkuRow) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(row.baseSku)}`)
      if (response.ok) {
        const product = await response.json()
        setSelectedProduct(product)
        setHighlightedSku(row.skuId)
        setProductModalOpen(true)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Table columns - Image | SKU | Color | Description | Material | Available | On Route | Wholesale Price | Retail Price
  const columns = React.useMemo<Array<DataTableColumn<AdminSkuRow>>>(
    () => [
      {
        id: 'image',
        header: 'Image',
        cell: (r) => (
          <div className="w-24 h-24 relative bg-muted rounded overflow-hidden flex-shrink-0">
            {r.imageUrl ? (
              <Image
                src={r.imageUrl}
                alt={r.description}
                fill
                className="object-contain"
                sizes="48px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'skuId',
        header: 'SKU',
        cell: (r) => (
          <button
            onClick={() => handleSkuClick(r)}
            className="font-medium text-primary hover:underline cursor-pointer text-left"
          >
            {r.skuId}
          </button>
        ),
      },
      {
        id: 'color',
        header: 'Color',
        cell: (r) => <span className="text-sm">{r.color || '—'}</span>,
      },
      {
        id: 'description',
        header: 'Description',
        cell: (r) => <span className="text-sm">{r.description}</span>,
      },
      {
        id: 'material',
        header: 'Material',
        cell: (r) => <span className="text-sm text-muted-foreground">{r.material || '—'}</span>,
      },
      {
        id: 'quantity',
        header: 'Available',
        cell: (r) => (
          <span className="text-right tabular-nums font-medium">{r.quantity}</span>
        ),
      },
      {
        id: 'onRoute',
        header: 'On Route',
        cell: (r) => (
          <span className={cn('text-right tabular-nums', r.onRoute > 0 ? 'text-blue-600 font-medium' : 'text-muted-foreground')}>
            {r.onRoute}
          </span>
        ),
      },
      {
        id: 'units',
        header: 'Units',
        cell: (r) => (
          <span className={cn('text-sm tabular-nums', r.unitsPerSku > 1 ? 'text-purple-600 font-medium' : 'text-muted-foreground')}>
            {r.unitsPerSku > 1 ? `${r.unitsPerSku}pc` : '1'}
          </span>
        ),
      },
      {
        id: 'packPrice',
        header: 'Pack Price',
        cell: (r) => (
          <span className="text-sm text-muted-foreground">
            {r.priceCad > 0 || r.priceUsd > 0
              ? `CAD: ${r.priceCad.toFixed(2)} / USD: ${r.priceUsd.toFixed(2)}`
              : '—'}
          </span>
        ),
      },
      {
        id: 'unitPrice',
        header: 'Unit Price',
        cell: (r) => {
          const unitCad = r.unitPriceCad ?? r.priceCad
          const unitUsd = r.unitPriceUsd ?? r.priceUsd
          return (
            <span className={cn('text-sm', r.unitsPerSku > 1 ? 'text-foreground font-medium' : 'text-muted-foreground')}>
              {unitCad > 0 || unitUsd > 0
                ? `CAD: ${unitCad.toFixed(2)} / USD: ${unitUsd.toFixed(2)}`
                : '—'}
            </span>
          )
        },
      },
      {
        id: 'retailPrice',
        header: 'Retail Price',
        cell: (r) => (
          <span className="text-sm text-muted-foreground">
            {r.msrpCad > 0 || r.msrpUsd > 0
              ? `C: ${r.msrpCad.toFixed(2)}, U: ${r.msrpUsd.toFixed(2)}`
              : '—'}
          </span>
        ),
      },
      {
        id: 'collection',
        header: 'Collection',
        cell: (r) => <span className="text-sm">{r.categoryName || '—'}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        cell: (r) => (
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
              r.showInPreOrder
                ? 'bg-purple-100 text-purple-700'
                : 'bg-green-100 text-green-700'
            )}
          >
            {r.showInPreOrder ? 'Pre-Order' : 'ATS'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: (r) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleTogglePreOrder(r.id, r.showInPreOrder)}
              >
                {r.showInPreOrder ? 'Move to ATS' : 'Move to Pre-Order'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(r.id)}
                className="text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [handleDelete, handleTogglePreOrder, handleSkuClick]
  )

  // Bulk actions
  const bulkActions = React.useMemo(
    () =>
      selectedIds.length > 0
        ? [
            {
              label: 'Move to ATS',
              onClick: () => handleBulkSetPreOrder(false),
            },
            {
              label: 'Move to Pre-Order',
              onClick: () => handleBulkSetPreOrder(true),
            },
            {
              label: 'Delete',
              onClick: handleBulkDelete,
              variant: 'destructive' as const,
            },
          ]
        : [],
    [selectedIds.length, handleBulkSetPreOrder, handleBulkDelete]
  )

  return (
    <div className="space-y-4">
      {/* Filters Container */}
      <div className="rounded-md border border-border bg-background">
        {/* Collection Selector */}
        <div className="border-b border-border p-4">
          <CollectionSelector
            collections={categories}
            mode={collectionMode}
            selectedIds={selectedCollectionIds}
            onModeChange={handleCollectionModeChange}
            onSelectionChange={handleCollectionSelectionChange}
          />
        </div>

        {/* Search + Actions Row */}
        <div className="flex flex-wrap gap-3 p-4">
          <SearchInput
            value={q}
            onValueChange={(v) => setParam('q', v || null)}
            placeholder="Search SKU, description..."
            className="h-10 w-full max-w-md"
          />

          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowUploadModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Currency</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={exportCurrency}
                  onValueChange={(v) => setExportCurrency(v as CurrencyMode)}
                >
                  <DropdownMenuRadioItem value="BOTH">Both (CAD/USD)</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="CAD">CAD Only</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="USD">USD Only</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Download Format</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => doExport()}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel (XLSX)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExportPdf('landscape')}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF - Landscape
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExportPdf('portrait')}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF - Portrait
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      {/* Loading indicator */}
      {isLoading && (
        <div className="text-sm text-muted-foreground">Updating...</div>
      )}

      {/* Data Table */}
      <DataTable
        data={initialRows}
        columns={columns}
        getRowId={(r) => r.id}
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

      {/* Upload Modal */}
      <UploadProductsModal
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal
        open={productModalOpen}
        onOpenChange={setProductModalOpen}
        product={selectedProduct}
        highlightedSku={highlightedSku}
      />
    </div>
  )
}
