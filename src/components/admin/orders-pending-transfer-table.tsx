'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  DataTable,
  type DataTableColumn,
  Button,
  StatusBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import {
  transferOrderToShopify,
  validateOrderForShopify,
  bulkTransferOrdersToShopify,
} from '@/lib/data/actions/shopify'
import type { ShopifyValidationResult, BulkTransferResult } from '@/lib/types/shopify'
import { ArrowUpRight, Loader2, CheckCircle2, XCircle, AlertTriangle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/format'

// ============================================================================
// Types
// ============================================================================

interface OrderPendingTransfer {
  id: string
  orderNumber: string
  storeName: string
  orderAmount: number
  orderDate: Date
  salesRep: string
}

interface OrdersPendingTransferTableProps {
  orders: OrderPendingTransfer[]
  total: number
  page: number
  onPageChange: (page: number) => void
}

// ============================================================================
// Validation Modal Component
// ============================================================================

interface ValidationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  validation: ShopifyValidationResult | null
  isLoading: boolean
  onTransfer: () => void
  isTransferring: boolean
}

function ValidationModal({
  open,
  onOpenChange,
  validation,
  isLoading,
  onTransfer,
  isTransferring,
}: ValidationModalProps) {
  if (!validation && !isLoading) return null

  const hasInventoryIssues = validation?.inventoryStatus.some(
    (item) => item.status !== 'ok'
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Order {validation?.orderNumber || '...'} Validation
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Validating order...</span>
          </div>
        ) : validation ? (
          <div className="space-y-4">
            {/* Status Header */}
            <div
              className={cn(
                'flex items-center gap-3 p-4 rounded-lg',
                validation.valid
                  ? 'bg-green-50 dark:bg-green-950/30'
                  : 'bg-red-50 dark:bg-red-950/30'
              )}
            >
              {validation.valid ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-200">
                    Ready to Transfer
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6 text-red-600" />
                  <span className="font-medium text-red-800 dark:text-red-200">
                    Cannot Transfer
                  </span>
                </>
              )}
            </div>

            {/* Order Summary */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Items</span>
                <p className="font-medium">{validation.itemCount}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Total</span>
                <p className="font-medium">
                  ${validation.orderAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Customer</span>
                <p className="font-medium flex items-center gap-1">
                  {validation.customerEmail || 'No email'}
                  {validation.customerExists ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <span className="text-xs text-muted-foreground">(will create)</span>
                  )}
                </p>
              </div>
            </div>

            {/* Missing SKUs (Blockers) */}
            {validation.missingSkus.length > 0 && (
              <div className="border border-red-200 dark:border-red-800 rounded-lg p-4">
                <h4 className="font-medium text-red-800 dark:text-red-200 mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Missing SKUs ({validation.missingSkus.length})
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  These SKUs are not found in Shopify and must be added before transfer:
                </p>
                <ul className="text-sm font-mono space-y-1 max-h-32 overflow-y-auto">
                  {validation.missingSkus.map((sku) => (
                    <li key={sku} className="text-red-700 dark:text-red-300">
                      • {sku}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Inventory Status */}
            {validation.inventoryStatus.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-muted/50 border-b flex items-center gap-2">
                  {hasInventoryIssues ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  <span className="font-medium text-sm">
                    Inventory Status ({validation.inventoryStatus.length} items)
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">SKU</th>
                        <th className="text-center p-2 font-medium">Ordered</th>
                        <th className="text-center p-2 font-medium">Available</th>
                        <th className="text-left p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {validation.inventoryStatus.map((item) => (
                        <tr key={item.sku}>
                          <td className="p-2 font-mono text-xs">{item.sku}</td>
                          <td className="p-2 text-center">{item.ordered}</td>
                          <td className="p-2 text-center">{item.available}</td>
                          <td className="p-2">
                            {item.status === 'ok' && (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> OK
                              </span>
                            )}
                            {item.status === 'partial' && (
                              <span className="text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Partial
                              </span>
                            )}
                            {item.status === 'backorder' && (
                              <span className="text-red-600 flex items-center gap-1">
                                <XCircle className="h-3 w-3" /> Backorder
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Note about partial shipments */}
            {validation.valid && hasInventoryIssues && (
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                <strong>Note:</strong> Order will be created in Shopify with all items.
                Ship available items first, backorders when stock arrives.
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {validation.valid ? 'Cancel' : 'Close'}
              </Button>
              {validation.valid && (
                <Button onClick={onTransfer} disabled={isTransferring}>
                  {isTransferring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      Transfer to Shopify
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Bulk Transfer Modal Component
// ============================================================================

interface BulkTransferModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  result: BulkTransferResult | null
  isTransferring: boolean
  onTransfer: () => void
}

function BulkTransferModal({
  open,
  onOpenChange,
  selectedCount,
  result,
  isTransferring,
  onTransfer,
}: BulkTransferModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {result ? 'Bulk Transfer Results' : 'Transfer Selected Orders'}
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You are about to transfer <strong>{selectedCount}</strong> order(s) to Shopify.
              This may take a moment.
            </p>

            {isTransferring && (
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm">Transferring orders...</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isTransferring}
              >
                Cancel
              </Button>
              <Button onClick={onTransfer} disabled={isTransferring}>
                {isTransferring ? 'Transferring...' : `Transfer ${selectedCount} Orders`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30">
                <div className="text-2xl font-bold text-green-600">{result.success}</div>
                <div className="text-sm text-green-700 dark:text-green-300">Successful</div>
              </div>
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30">
                <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                <div className="text-sm text-red-700 dark:text-red-300">Failed</div>
              </div>
            </div>

            {/* Detailed Results */}
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Order</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.results.map((r) => (
                    <tr key={r.orderId}>
                      <td className="p-2 font-mono">{r.orderNumber}</td>
                      <td className="p-2">
                        {r.success ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" /> Success
                          </span>
                        ) : (
                          <span className="text-red-600 flex items-center gap-1">
                            <XCircle className="h-4 w-4" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground text-xs">
                        {r.success
                          ? r.shopifyOrderNumber
                          : r.error?.slice(0, 50)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function OrdersPendingTransferTable({
  orders,
  total,
  page,
  onPageChange,
}: OrdersPendingTransferTableProps) {
  const router = useRouter()

  // Selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Single transfer state
  const [loadingId, setLoadingId] = React.useState<string | null>(null)
  const [lastResult, setLastResult] = React.useState<{
    orderId: string
    success: boolean
    message: string
    missingSkus?: string[]
  } | null>(null)

  // Validation modal state
  const [validationOpen, setValidationOpen] = React.useState(false)
  const [validationLoading, setValidationLoading] = React.useState(false)
  const [validationResult, setValidationResult] = React.useState<ShopifyValidationResult | null>(null)
  const [validationTransferring, setValidationTransferring] = React.useState(false)

  // Bulk transfer modal state
  const [bulkModalOpen, setBulkModalOpen] = React.useState(false)
  const [bulkTransferring, setBulkTransferring] = React.useState(false)
  const [bulkResult, setBulkResult] = React.useState<BulkTransferResult | null>(null)

  // Handle row selection
  const handleSelectRow = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Handle validate
  const handleValidate = React.useCallback(async (orderId: string) => {
    setValidationOpen(true)
    setValidationLoading(true)
    setValidationResult(null)

    try {
      const result = await validateOrderForShopify(orderId)
      setValidationResult(result)
    } catch (e) {
      console.error('Validation error:', e)
    } finally {
      setValidationLoading(false)
    }
  }, [])

  // Handle transfer from validation modal
  const handleTransferFromValidation = React.useCallback(async () => {
    if (!validationResult) return

    setValidationTransferring(true)
    try {
      const result = await transferOrderToShopify(validationResult.orderId)

      if (result.success) {
        setLastResult({
          orderId: validationResult.orderId,
          success: true,
          message: `Order ${validationResult.orderNumber} transferred successfully! Shopify Order: ${result.shopifyOrderNumber}`,
        })
        setValidationOpen(false)
        router.refresh()
      } else {
        setLastResult({
          orderId: validationResult.orderId,
          success: false,
          message: `Failed to transfer ${validationResult.orderNumber}: ${result.error || 'Unknown error'}`,
          missingSkus: result.missingSkus,
        })
      }
    } catch (e) {
      setLastResult({
        orderId: validationResult.orderId,
        success: false,
        message: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
      })
    } finally {
      setValidationTransferring(false)
    }
  }, [validationResult, router])

  // Handle direct transfer (without validation)
  const handleTransfer = React.useCallback(
    async (orderId: string, orderNumber: string) => {
      setLoadingId(orderId)
      setLastResult(null)

      try {
        const result = await transferOrderToShopify(orderId)

        if (result.success) {
          setLastResult({
            orderId,
            success: true,
            message: `Order ${orderNumber} transferred successfully! Shopify Order: ${result.shopifyOrderNumber}`,
          })
          router.refresh()
        } else if (result.missingSkus && result.missingSkus.length > 0) {
          setLastResult({
            orderId,
            success: false,
            message: `Cannot transfer ${orderNumber}: ${result.missingSkus.length} SKU(s) not found in Shopify`,
            missingSkus: result.missingSkus,
          })
        } else {
          setLastResult({
            orderId,
            success: false,
            message: `Failed to transfer ${orderNumber}: ${result.error || 'Unknown error'}`,
          })
        }
      } catch (e) {
        setLastResult({
          orderId,
          success: false,
          message: `Error transferring ${orderNumber}: ${e instanceof Error ? e.message : 'Unknown error'}`,
        })
      } finally {
        setLoadingId(null)
      }
    },
    [router]
  )

  // Handle bulk transfer
  const handleBulkTransfer = React.useCallback(async () => {
    setBulkTransferring(true)
    setBulkResult(null)

    try {
      const result = await bulkTransferOrdersToShopify(Array.from(selectedIds))
      setBulkResult(result)
      if (result.success > 0) {
        router.refresh()
      }
    } catch (e) {
      console.error('Bulk transfer error:', e)
    } finally {
      setBulkTransferring(false)
    }
  }, [selectedIds, router])

  // Close bulk modal and clear selection
  const handleCloseBulkModal = React.useCallback((open: boolean) => {
    setBulkModalOpen(open)
    if (!open) {
      setBulkResult(null)
      setSelectedIds(new Set())
    }
  }, [])

  const columns = React.useMemo<Array<DataTableColumn<OrderPendingTransfer>>>(
    () => [
      {
        id: 'select',
        header: '',
        cell: (row) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => handleSelectRow(row.id)}
            className="h-4 w-4 rounded border-input"
          />
        ),
      },
      {
        id: 'orderNumber',
        header: 'Order #',
        cell: (row) => (
          <span className="font-medium font-mono">{row.orderNumber}</span>
        ),
      },
      {
        id: 'storeName',
        header: 'Store',
        cell: (row) => <span>{row.storeName}</span>,
      },
      {
        id: 'salesRep',
        header: 'Rep',
        cell: (row) => (
          <span className="text-muted-foreground">{row.salesRep || '—'}</span>
        ),
      },
      {
        id: 'orderDate',
        header: 'Order Date',
        cell: (row) => (
          <span className="text-muted-foreground">
            {formatDate(row.orderDate)}
          </span>
        ),
      },
      {
        id: 'orderAmount',
        header: 'Amount',
        cell: (row) => (
          <span className="font-medium">
            ${row.orderAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: () => <StatusBadge status="pending">Pending</StatusBadge>,
      },
      {
        id: 'actions',
        header: '',
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleValidate(row.id)}
              disabled={loadingId !== null}
              title="Validate order"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTransfer(row.id, row.orderNumber)}
              disabled={loadingId !== null}
            >
              {loadingId === row.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ArrowUpRight className="h-4 w-4 mr-1" />
                  Transfer
                </>
              )}
            </Button>
          </div>
        ),
      },
    ],
    [handleSelectRow, handleValidate, handleTransfer, loadingId, selectedIds]
  )

  // Select all handler
  const handleSelectAll = React.useCallback(() => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)))
    }
  }, [orders, selectedIds.size])

  const allSelected = orders.length > 0 && selectedIds.size === orders.length

  return (
    <div className="space-y-4">
      {/* Selection & Bulk Actions Toolbar */}
      {orders.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
          </label>

          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">|</span>
              <span className="text-sm font-medium">
                {selectedIds.size} order(s) selected
              </span>
              <Button
                size="sm"
                onClick={() => setBulkModalOpen(true)}
                disabled={bulkTransferring}
              >
                <ArrowUpRight className="h-4 w-4 mr-1" />
                Transfer Selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </>
          )}
        </div>
      )}

      {/* Result Message */}
      {lastResult && (
        <div
          className={`rounded-md p-4 ${
            lastResult.success
              ? 'bg-ats-bg border border-ats text-ats-text'
              : 'bg-destructive/10 border border-destructive text-destructive'
          }`}
        >
          <p className="font-medium">{lastResult.message}</p>
          {lastResult.missingSkus && lastResult.missingSkus.length > 0 && (
            <div className="mt-2">
              <p className="text-sm">Missing SKUs:</p>
              <ul className="mt-1 text-sm font-mono">
                {lastResult.missingSkus.map((sku) => (
                  <li key={sku}>• {sku}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={orders}
        columns={columns}
        getRowId={(row) => row.id}
        enableRowSelection={false}
        pageSize={50}
        manualPagination
        page={page}
        totalCount={total}
        onPageChange={onPageChange}
      />

      {/* Validation Modal */}
      <ValidationModal
        open={validationOpen}
        onOpenChange={setValidationOpen}
        validation={validationResult}
        isLoading={validationLoading}
        onTransfer={handleTransferFromValidation}
        isTransferring={validationTransferring}
      />

      {/* Bulk Transfer Modal */}
      <BulkTransferModal
        open={bulkModalOpen}
        onOpenChange={handleCloseBulkModal}
        selectedCount={selectedIds.size}
        result={bulkResult}
        isTransferring={bulkTransferring}
        onTransfer={handleBulkTransfer}
      />
    </div>
  )
}
