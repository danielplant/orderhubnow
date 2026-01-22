'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import type { BulkTransferResult } from '@/lib/types/shopify'

export interface BulkTransferModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Total number of selected orders */
  selectedCount: number
  /** Number of orders eligible for transfer (not in Shopify, not Draft, etc.) */
  eligibleCount: number
  /** Reasons why some orders are ineligible */
  ineligibleReasons?: Array<{ reason: string; count: number }>
  /** Results after transfer completes */
  result: BulkTransferResult | null
  /** Whether transfer is in progress */
  isTransferring: boolean
  /** Whether batch validation is in progress */
  isValidating?: boolean
  /** Orders with customer name discrepancies */
  discrepancyOrders?: Array<{
    orderId: string
    orderNumber: string
    ohnName: string
    shopifyName: string | null
  }>
  /** Callback to start the transfer */
  onTransfer: () => void
}

/**
 * BulkTransferModal - Modal for bulk transferring orders to Shopify.
 * Shows eligibility breakdown, transfer progress, and detailed results.
 */
export function BulkTransferModal({
  open,
  onOpenChange,
  selectedCount,
  eligibleCount,
  ineligibleReasons,
  result,
  isTransferring,
  isValidating,
  discrepancyOrders,
  onTransfer,
}: BulkTransferModalProps) {
  const ineligibleCount = selectedCount - eligibleCount
  const hasIneligible = ineligibleCount > 0
  const hasDiscrepancies = discrepancyOrders && discrepancyOrders.length > 0
  const actualEligibleCount = hasDiscrepancies
    ? eligibleCount - discrepancyOrders.length
    : eligibleCount

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
            {/* Validating State */}
            {isValidating ? (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Checking customer data...</span>
              </div>
            ) : (
              <>
                {/* Discrepancy Warning */}
                {hasDiscrepancies && (
                  <div className="space-y-3">
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-2 flex-1">
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            {discrepancyOrders.length} order(s) need individual review:
                          </p>
                          <div className="max-h-32 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="pb-1">Order</th>
                                  <th className="pb-1">OHN Name</th>
                                  <th className="pb-1">Shopify Name</th>
                                </tr>
                              </thead>
                              <tbody>
                                {discrepancyOrders.map((order) => (
                                  <tr key={order.orderId} className="border-t border-border/50">
                                    <td className="py-1 font-mono">{order.orderNumber}</td>
                                    <td className="py-1">{order.ohnName || '(empty)'}</td>
                                    <td className="py-1">{order.shopifyName || '(none)'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300">
                            These orders will be skipped. Transfer them individually to review customer names.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Eligibility Summary */}
                {hasIneligible ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          {actualEligibleCount} of {selectedCount} orders can be transferred
                        </p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-300">
                          {ineligibleCount} order(s) will be skipped:
                        </p>
                        {ineligibleReasons && ineligibleReasons.length > 0 && (
                          <ul className="text-xs text-yellow-700 dark:text-yellow-300 list-disc list-inside">
                            {ineligibleReasons.map((r, i) => (
                              <li key={i}>{r.count} {r.reason}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ) : actualEligibleCount > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You are about to transfer <strong>{actualEligibleCount}</strong> order(s) to Shopify.
                    This may take a moment.
                  </p>
                ) : (
                  <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                    <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">
                        No orders can be transferred
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300">
                        All selected orders either need individual review or are already in Shopify.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

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
                disabled={isTransferring || isValidating}
              >
                Cancel
              </Button>
              <Button
                onClick={onTransfer}
                disabled={isTransferring || isValidating || actualEligibleCount === 0}
              >
                {isTransferring
                  ? 'Transferring...'
                  : isValidating
                    ? 'Validating...'
                    : `Transfer ${actualEligibleCount} Order${actualEligibleCount !== 1 ? 's' : ''}`}
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
            {result.results.length > 0 && (
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Order</th>
                      <th className="text-left p-2 font-medium">Status</th>
                      <th className="text-left p-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.results.map((r) => (
                      <tr key={r.orderId}>
                        <td className="p-2 font-mono text-xs">{r.orderNumber}</td>
                        <td className="p-2">
                          {r.success ? (
                            <span className="text-green-600 flex items-center gap-1 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Success
                            </span>
                          ) : (
                            <span className="text-red-600 flex items-center gap-1 text-xs">
                              <XCircle className="h-3.5 w-3.5" /> Failed
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground text-xs max-w-[150px] truncate">
                          {r.success ? r.shopifyOrderNumber : r.error?.slice(0, 50)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
