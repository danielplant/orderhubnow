'use client'

import * as React from 'react'
import Link from 'next/link'
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
  DateRangePopover,
  type DateRange,
  SearchInput,
  FilterPill,
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
import { CancelOrderDialog } from '@/components/admin/cancel-order-dialog'
import { CloseOrderDialog } from '@/components/admin/close-order-dialog'
import { ShopifySyncErrorDialog, type SyncErrorAction } from '@/components/admin/shopify-sync-error-dialog'
import { cn } from '@/lib/utils'
import type { AdminOrderRow, ArchiveTrashCounts, OrderFacets, OrderStatus, OrdersListResult, ViewMode } from '@/lib/types/order'
import type { ShopifyValidationResult, BulkTransferResult, BatchValidationResult } from '@/lib/types/shopify'
import { bulkUpdateStatus, updateOrderStatus, archiveOrders, restoreFromArchive, trashOrders, restoreFromTrash, permanentlyDeleteOrders } from '@/lib/data/actions/orders'
import { ViewModeTabs } from '@/components/admin/view-mode-tabs'
import { ArchiveOrderDialog } from '@/components/admin/archive-order-dialog'
import { TrashOrderDialog } from '@/components/admin/trash-order-dialog'
import { PermanentDeleteDialog } from '@/components/admin/permanent-delete-dialog'
import type { ShopifyCancelReason } from '@/lib/shopify/client'
import { validateOrderForShopify, transferOrderToShopify, bulkTransferOrdersToShopify, batchValidateOrdersForShopify } from '@/lib/data/actions/shopify'
import { MoreHorizontal, AlertTriangle, SearchX } from 'lucide-react'
import { toast } from 'sonner'

// ============================================================================
// Types
// ============================================================================

interface OrdersTableProps {
  initialOrders: AdminOrderRow[]
  total: number
  statusCounts: OrdersListResult['statusCounts']
  facets: OrderFacets
  viewModeCounts: ArchiveTrashCounts
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
  customerEmail: 'Email',
  collection: 'OHN Collection',
  shopifyCollectionRaw: 'Shopify Collection',
  season: 'Season',
  shipStartDate: 'Ship Window',
  orderDate: 'Order Date',
  orderAmount: 'Total',
  shippedTotal: 'Shipped',
  variance: 'Variance',
  notes: 'Notes',
  statusSync: 'Status',
  actions: 'Actions',
}

// Show essential columns by default (users can add more via column visibility toggle)
const DEFAULT_VISIBLE_COLUMNS = [
  'orderNumber',
  'orderType',
  'storeName',
  'salesRep',
  'shipStartDate',
  'orderDate',
  'orderAmount',
  'statusSync',
  'actions',
]
const REQUIRED_COLUMNS = ['orderNumber', 'actions']

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  orderNumber: 100,
  orderType: 80,
  storeName: 160,
  salesRep: 100,
  customerEmail: 180,
  collection: 110,
  shopifyCollectionRaw: 130,
  season: 80,
  shipStartDate: 150,
  orderDate: 100,
  orderAmount: 100,
  shippedTotal: 100,
  variance: 100,
  notes: 140,
  statusSync: 120,
  actions: 60,
}

// Map OrderStatus to StatusBadge status prop
function _getStatusBadgeStatus(status: OrderStatus) {
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

export function OrdersTable({ initialOrders, total, statusCounts, facets, viewModeCounts }: OrdersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Use shared table search hook for standard params
  const { q, page, pageSize, sort, dir, setParam, setParams, setPage, setSort, getParam } = useTableSearch()

  // Default sort for orders
  const actualSort = sort || 'orderDate'

  // View mode from URL (active/archived/trashed)
  const viewMode: ViewMode = (getParam('viewMode') as ViewMode) || 'active'

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
  const [transferError, setTransferError] = React.useState<string | null>(null)
  const [transferWarning, setTransferWarning] = React.useState<string | null>(null)
  // Track modal session to prevent stale timeouts from closing reopened modals
  const modalSessionRef = React.useRef(0)

  // Bulk transfer modal state
  const [bulkModalOpen, setBulkModalOpen] = React.useState(false)
  const [bulkTransferResult, setBulkTransferResult] = React.useState<BulkTransferResult | null>(null)
  const [isBulkTransferring, setIsBulkTransferring] = React.useState(false)
  const [bulkValidating, setBulkValidating] = React.useState(false)
  const [bulkValidationResult, setBulkValidationResult] = React.useState<BatchValidationResult | null>(null)

  // Archive/Trash dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false)
  const [trashDialogOpen, setTrashDialogOpen] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [dialogOrderIds, setDialogOrderIds] = React.useState<string[]>([])
  const [dialogShopifyCount, setDialogShopifyCount] = React.useState(0)
  // Cancel order dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false)
  const [cancelOrderData, setCancelOrderData] = React.useState<{
    id: string
    orderNumber: string
    isShopifyOrder: boolean
  } | null>(null)
  const [pendingCancelOptions, setPendingCancelOptions] = React.useState<{
    reason: ShopifyCancelReason
    notifyCustomer: boolean
    restockInventory: boolean
  } | null>(null)

  // Close order (Invoiced) dialog state
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false)
  const [closeOrderData, setCloseOrderData] = React.useState<{
    id: string
    orderNumber: string
  } | null>(null)

  // Shopify sync error dialog state
  const [syncErrorDialogOpen, setSyncErrorDialogOpen] = React.useState(false)
  const [syncErrorData, setSyncErrorData] = React.useState<{
    orderNumber: string
    errorMessage: string
    action: 'cancel' | 'close'
    orderId: string
  } | null>(null)

  // Column visibility state (localStorage persisted, no flash)
  const {
    visibleColumns,
    toggleColumn,
    resetColumns,
    isHydrated,
  } = useColumnVisibility({
    storageKey: 'orders-table-columns',
    defaultColumns: DEFAULT_VISIBLE_COLUMNS,
  })

  // Column widths state (separate from visibility - debounced persistence is fine here)
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS)

  // Hydrate column widths from localStorage on mount
  React.useEffect(() => {
    try {
      const savedWidths = localStorage.getItem('orders-table-widths')
      if (savedWidths) {
        setColumnWidths(JSON.parse(savedWidths))
      }
    } catch {}
  }, [])

  // Persist column widths (debounced)
  const widthsRef = React.useRef(columnWidths)
  widthsRef.current = columnWidths
  React.useEffect(() => {
    if (!isHydrated) return
    const timeout = setTimeout(() => {
      localStorage.setItem('orders-table-widths', JSON.stringify(widthsRef.current))
    }, 500)
    return () => clearTimeout(timeout)
  }, [columnWidths, isHydrated])

  // Additional URL params (beyond standard ones from hook)
  const status = (getParam('status') || 'All') as 'All' | OrderStatus
  const syncStatus = getParam('syncStatus') || ''
  const rep = getParam('rep') || ''
  const orderType = getParam('orderType') || ''
  const season = getParam('season') || ''
  const collection = getParam('collection') || ''
  const dateFrom = getParam('dateFrom') || ''
  const dateTo = getParam('dateTo') || ''

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
    if (orderType) {
      chips.push({
        key: 'orderType',
        label: 'Type',
        value: orderType,
        onRemove: () => setParam('orderType', null),
      })
    }
    if (collection) {
      chips.push({
        key: 'collection',
        label: 'Collection',
        value: collection,
        onRemove: () => setParam('collection', null),
      })
    }
    if (season) {
      chips.push({
        key: 'season',
        label: 'Season',
        value: season,
        onRemove: () => setParam('season', null),
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
  }, [status, rep, orderType, collection, season, syncStatus, dateFrom, dateTo, q, setParam, searchParams, router])

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

  // Handle cancel order click - opens dialog for confirmation
  const handleCancelClick = React.useCallback((order: AdminOrderRow) => {
    setCancelOrderData({
      id: order.id,
      orderNumber: order.orderNumber,
      isShopifyOrder: order.inShopify,
    })
    setCancelDialogOpen(true)
  }, [])

  // Handle cancel order confirmation from dialog
  const handleCancelConfirm = React.useCallback(async (options: {
    reason: ShopifyCancelReason
    notifyCustomer: boolean
    restockInventory: boolean
  }) => {
    if (!cancelOrderData) return

    const result = await updateOrderStatus({
      orderId: cancelOrderData.id,
      newStatus: 'Cancelled',
      options: {
        cancelReason: options.reason,
        notifyCustomer: options.notifyCustomer,
        restockInventory: options.restockInventory,
      },
    })

    if (result.success) {
      toast.success(`Order ${cancelOrderData.orderNumber} cancelled`)
      setCancelDialogOpen(false)
      setCancelOrderData(null)
      router.refresh()
    } else if (result.shopifySync && !result.shopifySync.success) {
      // Shopify sync failed - show error dialog
      setCancelDialogOpen(false)
      setPendingCancelOptions(options)
      setSyncErrorData({
        orderId: cancelOrderData.id,
        orderNumber: cancelOrderData.orderNumber,
        errorMessage: result.shopifySync.error || 'Unknown error',
        action: 'cancel',
      })
      setSyncErrorDialogOpen(true)
    } else {
      toast.error('Failed to cancel order', {
        description: result.error,
      })
    }
  }, [cancelOrderData, router])

  // Handle invoiced click - opens dialog for Shopify orders
  const handleInvoicedClick = React.useCallback((order: AdminOrderRow) => {
    if (order.inShopify) {
      // Show confirmation dialog for Shopify orders
      setCloseOrderData({
        id: order.id,
        orderNumber: order.orderNumber,
      })
      setCloseDialogOpen(true)
    } else {
      // Non-Shopify order - just update directly
      handleStatusChange(order.id, 'Invoiced')
    }
  }, [handleStatusChange])

  // Handle invoiced confirmation from dialog
  const handleInvoicedConfirm = React.useCallback(async () => {
    if (!closeOrderData) return

    const result = await updateOrderStatus({
      orderId: closeOrderData.id,
      newStatus: 'Invoiced',
    })

    if (result.success) {
      toast.success(`Order ${closeOrderData.orderNumber} marked as Invoiced`)
      setCloseDialogOpen(false)
      setCloseOrderData(null)
      router.refresh()
    } else if (result.shopifySync && !result.shopifySync.success) {
      // Shopify sync failed - show error dialog
      setCloseDialogOpen(false)
      setSyncErrorData({
        orderId: closeOrderData.id,
        orderNumber: closeOrderData.orderNumber,
        errorMessage: result.shopifySync.error || 'Unknown error',
        action: 'close',
      })
      setSyncErrorDialogOpen(true)
    } else {
      toast.error('Failed to mark order as Invoiced', {
        description: result.error,
      })
    }
  }, [closeOrderData, router])

  // Handle sync error dialog action
  const handleSyncErrorAction = React.useCallback(async (action: SyncErrorAction) => {
    if (!syncErrorData) return

    if (action === 'abort') {
      // User chose to abort - just close everything
      setSyncErrorDialogOpen(false)
      setSyncErrorData(null)
      setPendingCancelOptions(null)
      setCancelOrderData(null)
      setCloseOrderData(null)
      return
    }

    if (action === 'retry') {
      // User chose to retry - reopen the original dialog
      setSyncErrorDialogOpen(false)
      if (syncErrorData.action === 'cancel' && cancelOrderData) {
        setCancelDialogOpen(true)
      } else if (syncErrorData.action === 'close' && closeOrderData) {
        setCloseDialogOpen(true)
      }
      setSyncErrorData(null)
      return
    }

    if (action === 'proceed') {
      // User chose to proceed without Shopify sync
      const result = await updateOrderStatus({
        orderId: syncErrorData.orderId,
        newStatus: syncErrorData.action === 'cancel' ? 'Cancelled' : 'Invoiced',
        options: {
          skipShopifySync: true,
          ...(syncErrorData.action === 'cancel' && pendingCancelOptions ? {
            cancelReason: pendingCancelOptions.reason,
            notifyCustomer: pendingCancelOptions.notifyCustomer,
            restockInventory: pendingCancelOptions.restockInventory,
          } : {}),
        },
      })

      if (result.success) {
        toast.success(`Order ${syncErrorData.orderNumber} ${syncErrorData.action === 'cancel' ? 'cancelled' : 'marked as Invoiced'} (local only)`)
        router.refresh()
      } else {
        toast.error('Failed to update order', {
          description: result.error,
        })
      }

      setSyncErrorDialogOpen(false)
      setSyncErrorData(null)
      setPendingCancelOptions(null)
      setCancelOrderData(null)
      setCloseOrderData(null)
    }
  }, [syncErrorData, cancelOrderData, closeOrderData, pendingCancelOptions, router])

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

  // Archive/Trash handlers
  const openArchiveDialog = React.useCallback((orderIds: string[]) => {
    const orders = initialOrders.filter(o => orderIds.includes(o.id))
    const shopifyCount = orders.filter(o => o.inShopify).length
    setDialogOrderIds(orderIds)
    setDialogShopifyCount(shopifyCount)
    setArchiveDialogOpen(true)
  }, [initialOrders])

  const openTrashDialog = React.useCallback((orderIds: string[]) => {
    const orders = initialOrders.filter(o => orderIds.includes(o.id))
    const shopifyCount = orders.filter(o => o.inShopify).length
    setDialogOrderIds(orderIds)
    setDialogShopifyCount(shopifyCount)
    setTrashDialogOpen(true)
  }, [initialOrders])

  const openDeleteDialog = React.useCallback((orderIds: string[]) => {
    const orders = initialOrders.filter(o => orderIds.includes(o.id))
    const shopifyCount = orders.filter(o => o.inShopify).length
    setDialogOrderIds(orderIds)
    setDialogShopifyCount(shopifyCount)
    setDeleteDialogOpen(true)
  }, [initialOrders])

  const handleArchive = React.useCallback(async () => {
    setIsLoading(true)
    try {
      await archiveOrders({ orderIds: dialogOrderIds })
      setSelectedIds([])
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }, [dialogOrderIds, router])

  const handleTrash = React.useCallback(async () => {
    setIsLoading(true)
    try {
      await trashOrders({ orderIds: dialogOrderIds })
      setSelectedIds([])
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }, [dialogOrderIds, router])

  const handleRestore = React.useCallback(async (orderIds: string[]) => {
    setIsLoading(true)
    try {
      if (viewMode === 'archived') {
        await restoreFromArchive({ orderIds })
      } else if (viewMode === 'trashed') {
        await restoreFromTrash({ orderIds })
      }
      setSelectedIds([])
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }, [viewMode, router])

  const handlePermanentDelete = React.useCallback(async () => {
    setIsLoading(true)
    try {
      await permanentlyDeleteOrders({ orderIds: dialogOrderIds })
      setSelectedIds([])
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }, [dialogOrderIds, router])

  // Transfer handlers
  const handleValidateOrder = React.useCallback(async (orderId: string) => {
    modalSessionRef.current += 1 // New modal session
    const validationSession = modalSessionRef.current // Capture for session-scoping

    setPreviewOrderId(orderId)
    setPreviewOpen(true)
    setValidationLoading(true)
    setValidationResult(null)
    setTransferError(null) // Clear any previous error
    setTransferWarning(null) // Clear any previous warning
    setIsTransferring(false) // Clear any stale in-flight state

    try {
      const result = await validateOrderForShopify(orderId)
      // Only apply results if still in same modal session
      if (modalSessionRef.current === validationSession) {
        setValidationResult(result)
      }
    } catch (error) {
      console.error('Validation failed:', error)
    } finally {
      // Only clear loading if still in same modal session
      if (modalSessionRef.current === validationSession) {
        setValidationLoading(false)
      }
    }
  }, [])

  const handleTransfer = React.useCallback(async (
    enabledTagIds?: string[],
    customerOverride?: {
      firstName: string
      lastName: string
      updateShopifyRecord: boolean
      shopifyCustomerId?: number
      currentShopifyName?: string
    }
  ) => {
    if (!previewOrderId) return

    const transferSession = modalSessionRef.current // Capture for session-scoping

    setIsTransferring(true)
    setTransferError(null)
    setTransferWarning(null)
    try {
      const result = await transferOrderToShopify(previewOrderId, { enabledTagIds, customerOverride })

      // Guard all result updates - only apply if still in same modal session
      if (modalSessionRef.current !== transferSession) {
        return // User opened different order, discard results
      }

      if (result.success) {
        if (result.customerUpdateWarning) {
          setTransferWarning(result.customerUpdateWarning)
          // Show warning briefly then close - but only if still in same modal session
          setTimeout(() => {
            if (modalSessionRef.current === transferSession) {
              setPreviewOpen(false)
              router.refresh()
            }
          }, 3000)
        } else {
          setPreviewOpen(false)
          setTransferError(null)
          router.refresh()
        }
      } else {
        // Capture the actual error from Shopify
        const errorMessage = result.error || result.errors?.join(', ') || 'Transfer failed'
        setTransferError(errorMessage)
        // Update validation to show failed state
        setValidationResult((prev) =>
          prev
            ? {
                ...prev,
                valid: false,
                missingSkus: result.missingSkus ?? prev.missingSkus,
                inactiveSkus: result.inactiveSkus ?? prev.inactiveSkus,
              }
            : null
        )
      }
    } catch (error) {
      // Guard error updates too
      if (modalSessionRef.current !== transferSession) {
        return
      }
      const errorMessage = error instanceof Error ? error.message : 'Transfer failed unexpectedly'
      setTransferError(errorMessage)
      console.error('Transfer failed:', error)
    } finally {
      // Only clear isTransferring if still in same session
      if (modalSessionRef.current === transferSession) {
        setIsTransferring(false)
      }
    }
  }, [previewOrderId, router])

  // Calculate selected orders
  const selectedOrders = React.useMemo(
    () => initialOrders.filter((o) => selectedIds.includes(o.id)),
    [initialOrders, selectedIds]
  )

  // Calculate eligible orders for bulk transfer
  const eligibleForTransfer = React.useMemo(
    () =>
      initialOrders.filter(
        (o) => selectedIds.includes(o.id) && !o.inShopify && o.status !== 'Draft' && o.status !== 'Cancelled'
      ),
    [initialOrders, selectedIds]
  )

  const ineligibleReasons = React.useMemo(() => {
    const reasons: Array<{ reason: string; count: number }> = []
    const selected = initialOrders.filter((o) => selectedIds.includes(o.id))
    const alreadySynced = selected.filter((o) => o.inShopify).length
    const drafts = selected.filter((o) => o.status === 'Draft').length
    const cancelled = selected.filter((o) => o.status === 'Cancelled').length
    if (alreadySynced > 0) reasons.push({ reason: 'already in Shopify', count: alreadySynced })
    if (drafts > 0) reasons.push({ reason: 'Draft status', count: drafts })
    if (cancelled > 0) reasons.push({ reason: 'Cancelled status', count: cancelled })
    return reasons
  }, [initialOrders, selectedIds])

  // Calculate orders eligible for status changes (not cancelled or invoiced)
  const eligibleForStatusChange = React.useMemo(
    () =>
      initialOrders.filter(
        (o) => selectedIds.includes(o.id) && o.status !== 'Cancelled' && o.status !== 'Invoiced'
      ),
    [initialOrders, selectedIds]
  )

  const handleBulkTransfer = React.useCallback(async () => {
    // Filter out orders with discrepancies
    const discrepancyIds = new Set(bulkValidationResult?.discrepancyOrderIds ?? [])
    const eligibleIds = eligibleForTransfer
      .map((o) => o.id)
      .filter((id) => !discrepancyIds.has(id))

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
  }, [eligibleForTransfer, bulkValidationResult, router])

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

  // Column width change handler (linked resize - receives multiple column updates)
  const handleColumnWidthChange = React.useCallback((updates: Record<string, number>) => {
    setColumnWidths((prev) => ({ ...prev, ...updates }))
  }, [])

  // Column visibility change handlers
  const handleColumnVisibilityChange = React.useCallback((columnId: string, visible: boolean) => {
    toggleColumn(columnId, visible)
  }, [toggleColumn])

  const handleResetColumns = React.useCallback(() => {
    resetColumns()
    setColumnWidths(DEFAULT_COLUMN_WIDTHS)
  }, [resetColumns])

  // Table columns
  const allColumns = React.useMemo<Array<DataTableColumn<AdminOrderRow>>>(
    () => [
      {
        id: 'orderNumber',
        header: 'Order #',
        minWidth: 80,
        cell: (o) => (
          <div className="flex items-center gap-1.5">
            <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
              {o.orderNumber}
            </Link>
          </div>
        ),
      },
      {
        id: 'orderType',
        header: 'Type',
        minWidth: 60,
        cell: (o) => <OrderTypeBadge orderNumber={o.orderNumber} isPreOrder={o.isPreOrder} />,
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
        id: 'customerEmail',
        header: 'Email',
        minWidth: 120,
        cell: (o) => (
          <span className="text-sm text-muted-foreground truncate">
            {o.customerEmail || '—'}
          </span>
        ),
      },
      {
        id: 'collection',
        header: 'OHN Collection',
        minWidth: 80,
        cell: (o) => (
          <span className="text-sm text-muted-foreground truncate">
            {o.collection || '—'}
          </span>
        ),
      },
      {
        id: 'shopifyCollectionRaw',
        header: 'Shopify Collection',
        minWidth: 100,
        cell: (o) => (
          <span className="text-sm text-muted-foreground truncate">
            {o.shopifyCollectionRaw || '—'}
          </span>
        ),
      },
      {
        id: 'season',
        header: 'Season',
        minWidth: 60,
        cell: (o) => (
          <span className="text-sm text-muted-foreground">
            {o.season || '—'}
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
        header: 'Status',
        minWidth: 100,
        cell: (o) => {
          // Draft orders - grey, non-interactive
          if (o.status === 'Draft') {
            return (
              <span className="inline-flex items-center rounded-full bg-muted border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Draft
              </span>
            )
          }

          // Sync error - RED pill, clickable to retry
          if (o.syncError) {
            return (
              <button
                type="button"
                onClick={() => handleValidateOrder(o.id)}
                className="inline-flex items-center gap-1 rounded-full bg-destructive/10 border border-destructive/30 px-2.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
              >
                <AlertTriangle className="h-3 w-3" />
                <span>Failed</span>
              </button>
            )
          }

          // NOT in Shopify - GREY pill showing OHN status, clickable to transfer
          if (!o.inShopify) {
            return (
              <button
                type="button"
                onClick={() => handleValidateOrder(o.id)}
                className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-2.5 py-0.5 text-xs font-medium hover:bg-muted/80 transition-colors cursor-pointer"
              >
                <span>{o.status}</span>
                <span className="text-primary">→</span>
              </button>
            )
          }

          // IN Shopify - GREEN pill showing Shopify fulfillment status
          const fulfillmentText = formatShopifyStatus(o.shopifyFulfillmentStatus) || 'Unfulfilled'
          const isFulfilled = o.shopifyFulfillmentStatus === 'fulfilled'

          return (
            <span className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              isFulfilled
                ? "bg-success/10 border border-success/30 text-success"
                : "bg-success/5 border border-success/20 text-success/80"
            )}>
              {fulfillmentText}
            </span>
          )
        },
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
              {viewMode === 'active' && o.status === 'Pending' && !o.inShopify && (
                <DropdownMenuItem asChild>
                  <Link href={`/buyer/my-order?editOrder=${o.id}&returnTo=/admin/orders`}>
                    Edit Items
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setCommentsOrderId(o.id)}>
                Comments
              </DropdownMenuItem>
              
              {/* Active view: status changes and archive/trash */}
              {viewMode === 'active' && (
                <>
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
                  {/* Archive (only for Cancelled/Invoiced) */}
                  {(o.status === 'Cancelled' || o.status === 'Invoiced') && (
                    <DropdownMenuItem onClick={() => openArchiveDialog([o.id])}>
                      Archive
                    </DropdownMenuItem>
                  )}
                  {/* Trash (Shopify orders must be Cancelled/Invoiced) */}
                  <DropdownMenuItem
                    onClick={() => openTrashDialog([o.id])}
                    disabled={o.inShopify && o.status !== 'Cancelled' && o.status !== 'Invoiced'}
                    className="text-destructive"
                  >
                    Move to Trash
                  </DropdownMenuItem>
                </>
              )}

              {/* Archived view: restore and trash */}
              {viewMode === 'archived' && (
                <>
                  <DropdownMenuItem onClick={() => handleRestore([o.id])}>
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => openTrashDialog([o.id])}
                    className="text-destructive"
                  >
                    Move to Trash
                  </DropdownMenuItem>
                </>
              )}

              {/* Trashed view: restore and delete permanently */}
              {viewMode === 'trashed' && (
                <>
                  <DropdownMenuItem onClick={() => handleRestore([o.id])}>
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => openDeleteDialog([o.id])}
                    className="text-destructive"
                  >
                    Delete Permanently
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onClick={() => setShipmentOrder(o)}
                disabled={o.status === 'Cancelled' || o.status === 'Invoiced'}
              >
                Create Shipment
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange(o.id, 'Processing')}
                disabled={o.status === 'Processing' || o.status === 'Cancelled' || o.status === 'Invoiced'}
              >
                Mark Processing
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange(o.id, 'Shipped')}
                disabled={o.status === 'Shipped' || o.status === 'Cancelled' || o.status === 'Invoiced'}
              >
                Mark Shipped
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleInvoicedClick(o)}
                disabled={o.status === 'Invoiced' || o.status === 'Cancelled'}
              >
                Mark Invoiced
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCancelClick(o)}
                disabled={o.status === 'Cancelled' || o.status === 'Invoiced'}
                className="text-destructive"
              >
                Cancel Order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [handleStatusChange, handleValidateOrder, handleCancelClick, handleInvoicedClick, router, viewMode, openArchiveDialog, openTrashDialog, openDeleteDialog, handleRestore]
  )

  // Filter columns by visibility
  const columns = React.useMemo(
    () => allColumns.filter((col) => visibleColumns.includes(col.id)),
    [allColumns, visibleColumns]
  )

  // Calculate eligible orders for archive (only Cancelled/Invoiced)
  const eligibleForArchive = React.useMemo(() => {
    return selectedOrders.filter(o => o.status === 'Cancelled' || o.status === 'Invoiced')
  }, [selectedOrders])

  // Calculate eligible orders for trash (Shopify orders must be Cancelled/Invoiced)
  const eligibleForTrash = React.useMemo(() => {
    return selectedOrders.filter(o => {
      if (o.inShopify) {
        return o.status === 'Cancelled' || o.status === 'Invoiced'
      }
      return true
    })
  }, [selectedOrders])

  // Bulk actions - context-aware based on viewMode
  const bulkActions = React.useMemo(() => {
    if (selectedIds.length === 0) return []

    const actions: Array<{ label: string; onClick: () => void; disabled?: boolean }> = []

    // Active view actions
    if (viewMode === 'active') {
      // Status change actions with eligibility counts
      const eligibleCount = eligibleForStatusChange.length
      const hasEligible = eligibleCount > 0
      const showCount = eligibleCount < selectedIds.length

      actions.push({
        label: showCount ? `Mark Processing (${eligibleCount} of ${selectedIds.length})` : 'Mark Processing',
        onClick: async () => {
          if (!hasEligible) return
          setIsLoading(true)
          try {
            await bulkUpdateStatus({ orderIds: eligibleForStatusChange.map(o => o.id), newStatus: 'Processing' })
            setSelectedIds([])
            router.refresh()
          } finally {
            setIsLoading(false)
          }
        },
        disabled: !hasEligible,
      })

      actions.push({
        label: showCount ? `Mark Shipped (${eligibleCount} of ${selectedIds.length})` : 'Mark Shipped',
        onClick: async () => {
          if (!hasEligible) return
          setIsLoading(true)
          try {
            await bulkUpdateStatus({ orderIds: eligibleForStatusChange.map(o => o.id), newStatus: 'Shipped' })
            setSelectedIds([])
            router.refresh()
          } finally {
            setIsLoading(false)
          }
        },
        disabled: !hasEligible,
      })

      actions.push({
        label: 'Export QB',
        onClick: () => doExport('qb'),
      })

      // Add bulk transfer with eligibility info
      if (eligibleForTransfer.length > 0) {
        const label =
          eligibleForTransfer.length < selectedIds.length
            ? `Transfer to Shopify (${eligibleForTransfer.length} of ${selectedIds.length})`
            : `Transfer to Shopify (${eligibleForTransfer.length})`
        actions.push({
          label,
          onClick: async () => {
            setBulkTransferResult(null)
            setBulkValidationResult(null)
            setBulkModalOpen(true)
            setBulkValidating(true)

            try {
              const result = await batchValidateOrdersForShopify(eligibleForTransfer.map(o => o.id))
              setBulkValidationResult(result)
            } catch (e) {
              console.error('Batch validation failed:', e)
              setBulkValidationResult({
                results: [],
                hasDiscrepancies: true,
                discrepancyOrderIds: eligibleForTransfer.map(o => o.id),
                discrepancyOrders: eligibleForTransfer.map(o => ({
                  orderId: o.id,
                  orderNumber: o.orderNumber,
                  ohnName: o.storeName,
                  shopifyName: null,
                })),
                skippedDueToCapCount: 0,
              })
            } finally {
              setBulkValidating(false)
            }
          },
        })
      }

      // Archive action (only if there are eligible orders)
      if (eligibleForArchive.length > 0) {
        const archiveLabel = eligibleForArchive.length < selectedIds.length
          ? `Archive (${eligibleForArchive.length} of ${selectedIds.length})`
          : `Archive (${eligibleForArchive.length})`
        actions.push({
          label: archiveLabel,
          onClick: () => openArchiveDialog(eligibleForArchive.map(o => o.id)),
        })
      }

      // Trash action
      if (eligibleForTrash.length > 0) {
        const trashLabel = eligibleForTrash.length < selectedIds.length
          ? `Move to Trash (${eligibleForTrash.length} of ${selectedIds.length})`
          : `Move to Trash (${eligibleForTrash.length})`
        actions.push({
          label: trashLabel,
          onClick: () => openTrashDialog(eligibleForTrash.map(o => o.id)),
        })
      }
    }

    // Archived view actions
    if (viewMode === 'archived') {
      actions.push(
        {
          label: `Restore (${selectedIds.length})`,
          onClick: () => handleRestore(selectedIds),
        },
        {
          label: `Move to Trash (${selectedIds.length})`,
          onClick: () => openTrashDialog(selectedIds),
        }
      )
    }

    // Trashed view actions
    if (viewMode === 'trashed') {
      actions.push(
        {
          label: `Restore (${selectedIds.length})`,
          onClick: () => handleRestore(selectedIds),
        },
        {
          label: `Delete Permanently (${selectedIds.length})`,
          onClick: () => openDeleteDialog(selectedIds),
        }
      )
    }

    return actions
  }, [selectedIds, eligibleForTransfer, eligibleForStatusChange, eligibleForArchive, eligibleForTrash, doExport, viewMode, openArchiveDialog, openTrashDialog, openDeleteDialog, handleRestore, router])

  return (
    <div className="space-y-4">
      {/* View Mode Tabs (Active / Archived / Trash) */}
      <ViewModeTabs
        counts={viewModeCounts}
        current={viewMode}
        onChange={(mode) => {
          // Update both params atomically to avoid race condition
          setParams({
            viewMode: mode === 'active' ? null : mode,
            status: null,
          })
          setSelectedIds([])
        }}
      />

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
            placeholder="Search order #, store, rep, email..."
            className="h-10 w-full max-w-md"
          />

          <FilterPill
            label="Rep"
            value={rep || null}
            options={facets.reps.map((r) => ({ value: r.value, label: r.value, count: r.count }))}
            onChange={(v) => setParam('rep', v)}
          />

          <FilterPill
            label="Type"
            value={orderType || null}
            options={facets.types.map((t) => ({ value: t.value, label: t.value, count: t.count }))}
            onChange={(v) => setParam('orderType', v)}
          />

          <FilterPill
            label="Collection"
            value={collection || null}
            options={facets.collections.map((c) => ({ value: c.value, label: c.value, count: c.count }))}
            onChange={(v) => setParam('collection', v)}
          />

          <FilterPill
            label="Season"
            value={season || null}
            options={facets.seasons.map((s) => ({ value: s.value, label: s.value, count: s.count }))}
            onChange={(v) => setParam('season', v)}
          />

          <FilterPill
            label="Sync"
            value={syncStatus || null}
            options={[
              { value: 'pending', label: 'Pending sync' },
            ]}
            onChange={(v) => setParam('syncStatus', v)}
          />

          <DateRangePopover value={dateRange} onChange={handleDateRangeChange} />

          <ColumnVisibilityToggle
            columns={columnConfig}
            onChange={handleColumnVisibilityChange}
            onReset={handleResetColumns}
            isHydrated={isHydrated}
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

      {/* Data Table or Empty State */}
      {initialOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-md bg-background">
          <SearchX className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {filterChips.length > 0 || status !== 'All'
              ? 'No orders match your filters'
              : 'No orders yet'}
          </h3>
          <p className="text-muted-foreground text-sm mb-4">
            {filterChips.length > 0 || status !== 'All'
              ? "Try adjusting your search or filters to find what you're looking for."
              : 'Orders will appear here once they are created.'}
          </p>
          {(filterChips.length > 0 || status !== 'All') && (
            <Button variant="outline" size="sm" onClick={clearAllFilters}>
              Clear all filters
            </Button>
          )}
        </div>
      ) : (
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
          onPageChange={setPage}
          // Manual/server-side sorting
          manualSorting
          sort={{ columnId: actualSort, direction: dir }}
          onSortChange={setSort}
          // Sticky header and column resizing
          stickyHeader
          maxHeight="calc(100vh - 380px)"
          enableColumnResizing
          columnWidths={columnWidths}
          onColumnWidthChange={handleColumnWidthChange}
        />
      )}

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
        transferError={transferError}
        transferWarning={transferWarning}
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
        isValidating={bulkValidating}
        discrepancyOrders={bulkValidationResult?.discrepancyOrders}
        skippedDueToCapCount={bulkValidationResult?.skippedDueToCapCount}
        onTransfer={handleBulkTransfer}
      />

      {/* Archive Dialog */}
      <ArchiveOrderDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        orderCount={dialogOrderIds.length}
        shopifyOrderCount={dialogShopifyCount}
        onConfirm={handleArchive}
      />

      {/* Trash Dialog */}
      <TrashOrderDialog
        open={trashDialogOpen}
        onOpenChange={setTrashDialogOpen}
        orderCount={dialogOrderIds.length}
        shopifyOrderCount={dialogShopifyCount}
        onConfirm={handleTrash}
      />

      {/* Permanent Delete Dialog */}
      <PermanentDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        orderCount={dialogOrderIds.length}
        shopifyOrderCount={dialogShopifyCount}
        onConfirm={handlePermanentDelete}
      />
      {/* Cancel Order Dialog */}
      {cancelOrderData && (
        <CancelOrderDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          orderNumber={cancelOrderData.orderNumber}
          isShopifyOrder={cancelOrderData.isShopifyOrder}
          onConfirm={handleCancelConfirm}
        />
      )}

      {/* Close Order (Invoiced) Dialog */}
      {closeOrderData && (
        <CloseOrderDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          orderNumber={closeOrderData.orderNumber}
          onConfirm={handleInvoicedConfirm}
        />
      )}

      {/* Shopify Sync Error Dialog */}
      {syncErrorData && (
        <ShopifySyncErrorDialog
          open={syncErrorDialogOpen}
          onOpenChange={setSyncErrorDialogOpen}
          orderNumber={syncErrorData.orderNumber}
          errorMessage={syncErrorData.errorMessage}
          action={syncErrorData.action}
          onAction={handleSyncErrorAction}
        />
      )}
    </div>
  )
}
