'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTableSearch, useColumnVisibility } from '@/lib/hooks'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui'
import type { CurrencyMode } from '@/lib/types/export'
import { BulkActionsBar } from '@/components/admin/bulk-actions-bar'
import { ProductDetailModal } from '@/components/admin/product-detail-modal'
import { cn } from '@/lib/utils'
import { useImageConfig } from '@/lib/contexts'
import type { AdminSkuRow, CategoryForFilter } from '@/lib/types'
import type { AvailabilitySettingsRecord, AvailabilityView } from '@/lib/types/availability-settings'
import { AVAILABILITY_LEGEND_TEXT } from '@/lib/availability/settings'
import {
  deleteSku,
  bulkDeleteSkus,
  setSkuPreOrderFlag,
  bulkSetPreOrderFlag,
} from '@/lib/data/actions/products'
import { UploadProductsModal } from '@/components/admin/upload-products-modal'
import { CollectionSelector, type CollectionFilterMode } from '@/components/admin/collection-selector'
import { MoreHorizontal, Download, Upload, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react'
import { ColumnVisibilityToggle, type ColumnConfig } from '@/components/admin/column-visibility-toggle'
import { ExportProgress } from '@/components/admin/export-progress'

// ============================================================================
// Column Visibility Constants
// ============================================================================

const BASE_COLUMN_LABELS: Record<string, string> = {
  image: 'Image',
  skuId: 'SKU',
  color: 'Color',
  description: 'Description',
  rawDescription: 'Shopify Description',
  material: 'Material',
  quantity: 'Available',
  onRoute: 'On Route',
  units: 'Units',
  packPrice: 'Pack Price',
  unitPrice: 'Unit Price',
  retailPrice: 'Retail Price',
  collection: 'Collection',
  status: 'Status',
  actions: 'Actions',
}

const BASE_VISIBLE_COLUMNS = [
  'image', 'skuId', 'color', 'description', 'material',
  'quantity', 'onRoute', 'collection', 'status', 'actions',
]

const REQUIRED_COLUMNS = ['skuId', 'actions']

// ============================================================================
// Image Cell with S3 → Shopify fallback
// ============================================================================

function ImageCell({ thumbnailPath, imageUrl, alt }: { thumbnailPath: string | null; imageUrl: string | null; alt: string }) {
  const [primaryError, setPrimaryError] = React.useState(false)
  const [fallbackError, setFallbackError] = React.useState(false)
  const { getImageUrl } = useImageConfig()

  // Get URLs from config - dynamically controlled by dashboard
  const { primaryUrl, fallbackUrl } = getImageUrl('admin_products_table', thumbnailPath, imageUrl)

  return (
    <div className="w-24 h-24 relative bg-muted rounded overflow-hidden flex-shrink-0">
      {primaryUrl && !primaryError ? (
        <Image
          src={primaryUrl}
          alt={alt}
          fill
          className="object-contain"
          sizes="96px"
          onError={() => setPrimaryError(true)}
        />
      ) : fallbackUrl && !fallbackError ? (
        <Image
          src={fallbackUrl}
          alt={alt}
          fill
          className="object-contain"
          sizes="96px"
          onError={() => setFallbackError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Types
// ============================================================================

interface ProductsTableProps {
  initialRows: AdminSkuRow[]
  total: number
  categories: CategoryForFilter[]
  readOnly?: boolean
  availabilitySettings?: AvailabilitySettingsRecord
  availabilityView?: AvailabilityView
}

// ============================================================================
// Component
// ============================================================================

export function ProductsTable({
  initialRows,
  total,
  categories,
  readOnly = false,
  availabilitySettings,
  availabilityView = 'admin_products',
}: ProductsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Use shared table search hook for standard params
  const { q, page, pageSize, sort, dir, setParam, setPage, setSort, getParam } = useTableSearch()

  // Default sort for products
  const actualSort = sort || 'dateModified'

  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [showUploadModal, setShowUploadModal] = React.useState(false)
  const [productModalOpen, setProductModalOpen] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedProduct, setSelectedProduct] = React.useState<any | null>(null)
  const [highlightedSku, setHighlightedSku] = React.useState<string | undefined>()
  const [exportCurrency, setExportCurrency] = React.useState<CurrencyMode>('BOTH')
  const [exporting, setExporting] = React.useState(false)
  const [exportJobId, setExportJobId] = React.useState<string | null>(null)
  const [coverageError, setCoverageError] = React.useState<{
    pixelSize: number
    total: number
    cached: number
    missing: number
    missingSkuIds: string[]
    coveragePercent: number
  } | null>(null)

  const onRouteEnabled = availabilitySettings?.showOnRouteProducts ?? true

  // Parse collections param: 'all' | 'ats' | 'preorder' | '1,2,3'
  // NOTE: Must be declared BEFORE availableLabel which depends on it
  const collectionsParam = getParam('collections') || 'all'
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

  const availableLabel = React.useMemo(() => {
    if (!availabilitySettings) return 'Available'
    if (collectionMode === 'ats') return availabilitySettings.matrix.ats[availabilityView].label
    if (collectionMode === 'preorder') return availabilitySettings.matrix.preorder_incoming[availabilityView].label

    if (collectionMode === 'specific' && selectedCollectionIds.length > 0) {
      const types = selectedCollectionIds
        .map((id) => categories.find((c) => c.id === id)?.type)
        .filter(Boolean) as Array<'ATS' | 'PreOrder'>
      if (types.length > 0 && types.every((t) => t === 'ATS')) {
        return availabilitySettings.matrix.ats[availabilityView].label
      }
      if (types.length > 0 && types.every((t) => t === 'PreOrder')) {
        return availabilitySettings.matrix.preorder_incoming[availabilityView].label
      }
    }

    return availabilitySettings.matrix.ats[availabilityView].label
  }, [availabilitySettings, collectionMode, selectedCollectionIds, categories, availabilityView])

  const onRouteLabel = availabilitySettings?.onRouteLabelProducts ?? 'On Route'

  const defaultColumns = React.useMemo(() => {
    const base = [...BASE_VISIBLE_COLUMNS]
    return onRouteEnabled ? base : base.filter((id) => id !== 'onRoute')
  }, [onRouteEnabled])

  // Column visibility state (localStorage persisted, no flash)
  const {
    visibleColumns,
    toggleColumn,
    resetColumns,
    isHydrated,
  } = useColumnVisibility({
    storageKey: 'products-table-columns',
    defaultColumns,
  })

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

  // Export using async job queue via new API
  // Shows progress dialog and handles background processing
  const doExport = React.useCallback(async () => {
    setExporting(true)
    setCoverageError(null)
    try {
      const collections = searchParams.get('collections') || 'all'

      const response = await fetch('/api/admin/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'xlsx',
          collections,
          currency: exportCurrency,
          q: searchParams.get('q') || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.error === 'COVERAGE_REQUIRED') {
          setCoverageError(data.coverage)
          return
        }
        throw new Error(data.error || 'Export failed')
      }

      // For completed sync exports, download directly
      if (data.status === 'completed' && data.downloadUrl) {
        window.location.href = data.downloadUrl
        return
      }

      // For async exports, show progress dialog
      setExportJobId(data.jobId)
    } catch (error) {
      console.error('Export error:', error)
    } finally {
      setExporting(false)
    }
  }, [searchParams, exportCurrency])

  const doExportPdf = React.useCallback(async (orientation: 'landscape' | 'portrait') => {
    setExporting(true)
    setCoverageError(null)
    try {
      const collections = searchParams.get('collections') || 'all'

      const response = await fetch('/api/admin/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pdf',
          collections,
          currency: exportCurrency,
          q: searchParams.get('q') || undefined,
          orientation,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.error === 'COVERAGE_REQUIRED') {
          setCoverageError(data.coverage)
          return
        }
        throw new Error(data.error || 'Export failed')
      }

      // For completed sync exports, download directly
      if (data.status === 'completed' && data.downloadUrl) {
        window.location.href = data.downloadUrl
        return
      }

      // For async exports, show progress dialog
      setExportJobId(data.jobId)
    } catch (error) {
      console.error('Export error:', error)
    } finally {
      setExporting(false)
    }
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

  // Column visibility config
  const columnLabels = React.useMemo(
    () => ({
      ...BASE_COLUMN_LABELS,
      quantity: availableLabel,
      onRoute: onRouteLabel,
    }),
    [availableLabel, onRouteLabel]
  )

  const columnConfig = React.useMemo<ColumnConfig[]>(
    () =>
      Object.entries(columnLabels)
        .filter(([id]) => id !== 'onRoute' || onRouteEnabled)
        .map(([id, label]) => ({
          id,
          label,
          visible: visibleColumns.includes(id),
          required: REQUIRED_COLUMNS.includes(id),
        })),
    [visibleColumns, columnLabels, onRouteEnabled]
  )

  const handleColumnVisibilityChange = React.useCallback(
    (columnId: string, visible: boolean) => {
      toggleColumn(columnId, visible)
    },
    [toggleColumn]
  )

  const handleResetColumns = React.useCallback(() => {
    resetColumns()
  }, [resetColumns])

  // Table columns - all available columns
  const allColumns = React.useMemo<Array<DataTableColumn<AdminSkuRow>>>(
    () => [
      {
        id: 'image',
        header: 'Image',
        cell: (r) => (
          <ImageCell
            thumbnailPath={r.thumbnailPath}
            imageUrl={r.imageUrl}
            alt={r.description}
          />
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
        id: 'rawDescription',
        header: 'Shopify Description',
        cell: (r) => (
          <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
            {r.rawDescription || '—'}
          </span>
        ),
      },
      {
        id: 'material',
        header: 'Material',
        cell: (r) => <span className="text-sm text-muted-foreground">{r.material || '—'}</span>,
      },
      {
        id: 'quantity',
        header: (
          <div className="flex items-center gap-1">
            <span>{availableLabel}</span>
            <span className="text-xs text-muted-foreground" title={AVAILABILITY_LEGEND_TEXT}>ⓘ</span>
          </div>
        ),
        cell: (r) => (
          <a
            href={`/admin/dev/debug/shopify?sku=${encodeURIComponent(r.skuId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-right tabular-nums font-medium hover:underline"
          >
            {r.availableDisplay}
          </a>
        ),
      },
      {
        id: 'onRoute',
        header: onRouteLabel,
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
      // Only show actions column when not in readOnly mode
      ...(!readOnly ? [{
        id: 'actions',
        header: '',
        cell: (r: AdminSkuRow) => (
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
      }] : []),
    ],
    [handleDelete, handleTogglePreOrder, handleSkuClick, readOnly, availableLabel, onRouteLabel]
  )

  // Filter columns by visibility
  const columns = React.useMemo(
    () =>
      allColumns.filter((col) => {
        if (col.id === 'onRoute' && !onRouteEnabled) return false
        return visibleColumns.includes(col.id)
      }),
    [allColumns, visibleColumns, onRouteEnabled]
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
            placeholder="Search SKU, description, Shopify description..."
            className="h-10 w-full max-w-md"
          />

          <div className="ml-auto flex gap-2">
            <ColumnVisibilityToggle
              columns={columnConfig}
              onChange={handleColumnVisibilityChange}
              onReset={handleResetColumns}
              isHydrated={isHydrated}
            />
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={() => setShowUploadModal(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? 'Exporting...' : 'Export'}
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
                <DropdownMenuItem onClick={() => doExport()} disabled={exporting}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel (XLSX)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExportPdf('landscape')} disabled={exporting}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF - Landscape
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExportPdf('portrait')} disabled={exporting}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF - Portrait
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar - only show when not readOnly */}
      {!readOnly && selectedIds.length > 0 && (
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
        enableRowSelection={!readOnly}
        onSelectionChange={!readOnly ? setSelectedIds : undefined}
        pageSize={pageSize}
        // Manual/server-side pagination
        manualPagination
        page={page}
        totalCount={total}
        onPageChange={setPage}
        // Manual/server-side sorting
        manualSorting
        sort={{ columnId: actualSort, direction: dir }}
        onSortChange={setSort}
      />

      {/* Upload Modal - only render when not readOnly */}
      {!readOnly && (
        <UploadProductsModal
          open={showUploadModal}
          onOpenChange={setShowUploadModal}
        />
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        open={productModalOpen}
        onOpenChange={setProductModalOpen}
        product={selectedProduct}
        highlightedSku={highlightedSku}
      />

      {/* Coverage Error Modal */}
      <Dialog open={coverageError !== null} onOpenChange={(open) => !open && setCoverageError(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-600">Export Blocked: Missing Thumbnails</DialogTitle>
            <DialogDescription>
              Some product images are not cached in S3. Generate missing thumbnails before exporting.
            </DialogDescription>
          </DialogHeader>
          {coverageError && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-amber-600">{coverageError.missing}</div>
                  <div className="text-xs text-muted-foreground">Missing</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{coverageError.cached}</div>
                  <div className="text-xs text-muted-foreground">Cached</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{coverageError.coveragePercent}%</div>
                  <div className="text-xs text-muted-foreground">Coverage</div>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {coverageError.missing} of {coverageError.total} product images need to be generated
                  at {coverageError.pixelSize}px before exports can proceed.
                </p>
              </div>
              {coverageError.missingSkuIds.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Missing SKUs:</span>{' '}
                  {coverageError.missingSkuIds.slice(0, 5).join(', ')}
                  {coverageError.missing > 5 && (
                    <span> and {coverageError.missing - 5} more...</span>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCoverageError(null)}>
              Close
            </Button>
            {!readOnly ? (
              <Button
                onClick={() => {
                  setCoverageError(null)
                  window.location.href = '/admin/dev/shopify/images#thumbnail-generation'
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Generate Missing Thumbnails
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Contact your admin to generate missing thumbnails.
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Progress Modal */}
      <Dialog open={exportJobId !== null} onOpenChange={(open) => !open && setExportJobId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generating Export</DialogTitle>
            <DialogDescription>
              Your export is being processed. This may take a moment for large catalogs.
            </DialogDescription>
          </DialogHeader>
          {exportJobId && (
            <ExportProgress
              jobId={exportJobId}
              onComplete={() => {
                // Download will happen via the download button in the progress component
              }}
              onError={(error) => {
                console.error('Export failed:', error)
              }}
              onClose={() => setExportJobId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
