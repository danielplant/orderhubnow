'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Calendar, Package, Loader2 } from 'lucide-react'
import type { AffectedOrder } from '@/lib/types/planned-shipment'

interface AffectedOrdersPreviewDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  collectionName: string
  oldStart: string | null
  oldEnd: string | null
  newStart: string
  newEnd: string
  totalOrders: number
  totalShipments: number
  invalidCount: number
  shopifyExcludedCount: number
  previewOrders: AffectedOrder[]
}

export function AffectedOrdersPreviewDialog({
  open,
  onClose,
  onConfirm,
  collectionName,
  oldStart,
  oldEnd,
  newStart,
  newEnd,
  totalOrders,
  totalShipments,
  invalidCount,
  shopifyExcludedCount,
  previewOrders,
}: AffectedOrdersPreviewDialogProps) {
  const [isSaving, setIsSaving] = useState(false)

  async function handleConfirm() {
    setIsSaving(true)
    try {
      await onConfirm()
    } finally {
      setIsSaving(false)
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return 'Not set'
    // Extract date-only part and force local midnight (avoids UTC timezone shift)
    const dateOnly = d.split('T')[0]
    return new Date(dateOnly + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            This Change Affects Existing Orders
          </DialogTitle>
          <DialogDescription>
            Changing {collectionName} ship window
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date change summary */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground line-through">
              {formatDate(oldStart)} - {formatDate(oldEnd)}
            </span>
            <span>→</span>
            <span className="font-medium">
              {formatDate(newStart)} - {formatDate(newEnd)}
            </span>
          </div>

          {/* Impact summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span className="text-2xl font-bold">{totalOrders}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                orders ({totalShipments} shipments)
              </div>
            </div>
            <div className="p-3 bg-destructive/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-2xl font-bold text-destructive">
                  {invalidCount}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                have invalid dates
              </div>
            </div>
          </div>

          {shopifyExcludedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Note: {shopifyExcludedCount} orders already in Shopify are
              excluded
            </p>
          )}

          {/* Preview table */}
          {previewOrders.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">Order</th>
                    <th className="text-left p-2">Store</th>
                    <th className="text-left p-2">Current Dates</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewOrders.map((order) => (
                    <tr key={order.shipmentId} className="border-t">
                      <td className="p-2 font-mono text-xs">
                        {order.orderNumber}
                      </td>
                      <td className="p-2 truncate max-w-[120px]">
                        {order.storeName || '-'}
                      </td>
                      <td className="p-2 text-xs">
                        {formatDate(order.currentStart)} -{' '}
                        {formatDate(order.currentEnd)}
                      </td>
                      <td className="p-2 text-center">
                        {order.isInvalid ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                            Invalid
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalShipments > 5 && (
                <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                  +{totalShipments - 5} more shipments
                </div>
              )}
            </div>
          )}

          {/* Next steps info */}
          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
            <p className="font-medium mb-1">After saving, you&apos;ll be able to:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Bulk update affected shipments to the new window</li>
              <li>Notify reps and customers of the change</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save and Review Affected Orders'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
