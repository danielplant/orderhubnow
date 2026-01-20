'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Edit } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ShopifyValidationResult } from '@/lib/types/shopify'

export interface TransferPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  validation: ShopifyValidationResult | null
  isLoading: boolean
  onTransfer: () => void
  isTransferring: boolean
}

/**
 * TransferPreviewModal - Shows order summary before transferring to Shopify.
 * Displays validation status, order details, Shopify tags preview, and provides
 * Transfer, Edit Order, and Cancel actions.
 */
export function TransferPreviewModal({
  open,
  onOpenChange,
  validation,
  isLoading,
  onTransfer,
  isTransferring,
}: TransferPreviewModalProps) {
  if (!validation && !isLoading) return null

  const hasWarnings = validation?.inventoryStatus.some((item) => item.status !== 'ok')

  // Build order type from order number prefix
  const orderType = validation?.orderNumber?.startsWith('A') ? 'ATS' : 'Pre Order'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Transfer Preview
            {validation && (
              <StatusBadge status="new" className="font-mono text-xs">
                {validation.orderNumber}
              </StatusBadge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Validating order for transfer...</span>
          </div>
        ) : validation ? (
          <div className="space-y-6">
            {/* Status Banner */}
            <div
              className={cn(
                'flex items-center gap-3 p-4 rounded-lg border',
                validation.valid
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              )}
            >
              {validation.valid ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Ready to Transfer
                    </span>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      All SKUs mapped and inventory checked
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-red-800 dark:text-red-200">
                      Cannot Transfer
                    </span>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {validation.missingSkus.length} missing SKU(s) must be resolved first
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Order Summary */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Order Summary
              </h4>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-3">
                  <div>
                    <span className="text-muted-foreground">Store</span>
                    <p className="font-medium">{validation.storeName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Customer Email</span>
                    <p className="font-medium flex items-center gap-1">
                      {validation.customerEmail || 'No email'}
                      {validation.customerExists ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <span className="text-xs text-muted-foreground">(will create in Shopify)</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-muted-foreground">Ship Window</span>
                    <p className="font-medium">
                      {validation.shipWindow || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Collection/Season</span>
                    <p className="font-medium">
                      {validation.collection || '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t">
                <div>
                  <span className="text-muted-foreground">Line Items</span>
                  <p className="font-medium">{validation.itemCount} items</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Order Total</span>
                  <p className="font-medium text-lg">
                    ${validation.orderAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Shopify Tags Preview */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Shopify Tags (for filtering)
              </h4>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                  {orderType}
                </span>
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                  Wholesale
                </span>
                {validation.shipWindowTag && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-mono">
                    {validation.shipWindowTag}
                  </span>
                )}
                {validation.collection && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-mono">
                    SEASON_{validation.collection}
                  </span>
                )}
                {validation.salesRep && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                    {validation.salesRep}
                  </span>
                )}
              </div>
            </div>

            {/* Missing SKUs (Blockers) */}
            {validation.missingSkus.length > 0 && (
              <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-red-800 dark:text-red-200 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Missing SKUs ({validation.missingSkus.length})
                </h4>
                <p className="text-sm text-muted-foreground">
                  These SKUs must be added to Shopify before transfer:
                </p>
                <div className="bg-red-100 dark:bg-red-900/30 rounded p-2 max-h-32 overflow-y-auto">
                  <ul className="text-sm font-mono space-y-1">
                    {validation.missingSkus.map((sku) => (
                      <li key={sku} className="text-red-800 dark:text-red-200">{sku}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Inventory Warnings */}
            {hasWarnings && validation.valid && (
              <div className="border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Inventory Warnings
                </h4>
                <p className="text-sm text-muted-foreground">
                  Some items have limited or no inventory (transfer will still proceed):
                </p>
                <div className="max-h-32 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="pb-2 pr-4">SKU</th>
                        <th className="pb-2 pr-4">Ordered</th>
                        <th className="pb-2 pr-4">Available</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.inventoryStatus
                        .filter((item) => item.status !== 'ok')
                        .map((item) => (
                          <tr key={item.sku} className="border-b border-border/50">
                            <td className="py-1.5 pr-4 font-mono text-xs">{item.sku}</td>
                            <td className="py-1.5 pr-4">{item.ordered}</td>
                            <td className="py-1.5 pr-4">{item.available}</td>
                            <td className="py-1.5">
                              <StatusBadge
                                status={item.status === 'partial' ? 'partially-shipped' : 'cancelled'}
                                className="text-xs"
                              >
                                {item.status === 'partial' ? 'Partial' : 'Backorder'}
                              </StatusBadge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t mt-4">
          <div className="flex gap-2 flex-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            {validation && (
              <Button variant="outline" asChild className="flex-1 sm:flex-none">
                <Link href={`/buyer/my-order?editOrder=${validation.orderId}&returnTo=/admin/orders`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Order
                </Link>
              </Button>
            )}
          </div>
          <Button
            onClick={onTransfer}
            disabled={!validation?.valid || isTransferring}
            className="w-full sm:w-auto"
          >
            {isTransferring ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Transferring...
              </>
            ) : (
              <>
                Transfer to Shopify
                <ExternalLink className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
