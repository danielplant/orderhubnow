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
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'

export interface TrashOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderCount: number
  shopifyOrderCount: number
  onConfirm: () => Promise<void>
}

export function TrashOrderDialog({
  open,
  onOpenChange,
  orderCount,
  shopifyOrderCount,
  onConfirm,
}: TrashOrderDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onConfirm()
      onOpenChange(false)
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
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Move to Trash
          </DialogTitle>
          <DialogDescription>
            Move {orderCount} order{orderCount > 1 ? 's' : ''} to trash?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
            <p className="font-medium text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Orders in trash are permanently deleted after 30 days
            </p>
          </div>

          {shopifyOrderCount > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
              <p className="font-medium text-blue-800">
                {shopifyOrderCount} order{shopifyOrderCount > 1 ? 's are' : ' is'} in Shopify
              </p>
              <p className="text-blue-700 mt-1">
                {shopifyOrderCount > 1 ? 'They' : 'It'} will remain in Shopify.
                Trashing only affects this system.
              </p>
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium mb-2">Trashed orders:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Can be viewed in the &quot;Trash&quot; tab</li>
              <li>Can be restored within 30 days</li>
              <li>Are automatically deleted after 30 days</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Moving...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Move to Trash
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
