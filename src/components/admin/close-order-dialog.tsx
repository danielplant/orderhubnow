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
import { CheckCircle, Loader2 } from 'lucide-react'

export interface CloseOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderNumber: string
  isShopifyOrder?: boolean
  onConfirm: () => Promise<void>
}

export function CloseOrderDialog({
  open,
  onOpenChange,
  orderNumber,
  isShopifyOrder = false,
  onConfirm,
}: CloseOrderDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Mark Order as Invoiced
          </DialogTitle>
          <DialogDescription>
            Mark order {orderNumber} as invoiced?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isShopifyOrder ? (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
              <p className="font-medium text-blue-800 mb-2">This order exists in Shopify</p>
              <p className="text-blue-700">
                Marking as invoiced will also close the order in Shopify, 
                preventing further edits or fulfillment changes.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium mb-2">This will:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Mark the order as invoiced (final status)</li>
                <li>Log this action in the activity history</li>
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Invoiced orders are considered complete and cannot be modified further.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Mark Invoiced'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
