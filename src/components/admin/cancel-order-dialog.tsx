'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
} from '@/components/ui'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ShopifyCancelReason } from '@/lib/shopify/client'

/**
 * Cancellation reasons for display in the dialog.
 */
const CANCEL_REASONS: Array<{ value: ShopifyCancelReason; label: string }> = [
  { value: 'CUSTOMER', label: 'Customer request' },
  { value: 'INVENTORY', label: 'Out of stock' },
  { value: 'DECLINED', label: 'Payment declined' },
  { value: 'FRAUD', label: 'Suspected fraud' },
  { value: 'STAFF', label: 'Staff error' },
  { value: 'OTHER', label: 'Other' },
]

export interface CancelOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderNumber: string
  isShopifyOrder: boolean
  onConfirm: (options: {
    reason: ShopifyCancelReason
    notifyCustomer: boolean
    restockInventory: boolean
  }) => Promise<void>
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderNumber,
  isShopifyOrder,
  onConfirm,
}: CancelOrderDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [reason, setReason] = React.useState<ShopifyCancelReason>('CUSTOMER')
  const [notifyCustomer, setNotifyCustomer] = React.useState(true)
  const [restockInventory, setRestockInventory] = React.useState(true)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onConfirm({ reason, notifyCustomer, restockInventory })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      // Reset to defaults when closing
      setReason('CUSTOMER')
      setNotifyCustomer(true)
      setRestockInventory(true)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Cancel Order
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel order {orderNumber}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isShopifyOrder ? (
            <>
              {/* Shopify sync warning */}
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
                <p className="font-medium text-blue-800 mb-2">This order exists in Shopify</p>
                <p className="text-blue-700">
                  Cancelling will also cancel the order in Shopify. Choose your options below.
                </p>
              </div>

              {/* Cancellation reason */}
              <div>
                <label className="text-sm font-medium">
                  Cancellation reason <span className="text-destructive">*</span>
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ShopifyCancelReason)}
                  className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={isSubmitting}
                >
                  {CANCEL_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shopify options */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyCustomer}
                    onChange={(e) => setNotifyCustomer(e.target.checked)}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">
                    Notify customer via email
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restockInventory}
                    onChange={(e) => setRestockInventory(e.target.checked)}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">
                    Restock inventory in Shopify
                  </span>
                </label>
              </div>
            </>
          ) : (
            /* Non-Shopify order - simple confirmation */
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
              <p className="font-medium text-amber-800 mb-2">This will:</p>
              <ul className="list-disc list-inside text-amber-700 space-y-1">
                <li>Mark the order as cancelled</li>
                <li>Log this action in the activity history</li>
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            This action cannot be undone. Cancelled orders remain in the system for record-keeping.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              'Cancel Order'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
