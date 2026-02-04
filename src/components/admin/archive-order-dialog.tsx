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
import { Archive, Loader2, AlertTriangle } from 'lucide-react'

export interface ArchiveOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderCount: number
  shopifyOrderCount: number
  onConfirm: () => Promise<void>
}

export function ArchiveOrderDialog({
  open,
  onOpenChange,
  orderCount,
  shopifyOrderCount,
  onConfirm,
}: ArchiveOrderDialogProps) {
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
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-blue-600" />
            Archive Order{orderCount > 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Move {orderCount} order{orderCount > 1 ? 's' : ''} to archive?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {shopifyOrderCount > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
              <p className="font-medium text-blue-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {shopifyOrderCount} order{shopifyOrderCount > 1 ? 's are' : ' is'} in Shopify
              </p>
              <p className="text-blue-700 mt-1">
                {shopifyOrderCount > 1 ? 'They' : 'It'} will remain active in Shopify.
                Archiving only affects this system.
              </p>
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium mb-2">Archived orders:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Are moved out of the active orders list</li>
              <li>Can be viewed in the &quot;Archived&quot; tab</li>
              <li>Can be restored at any time</li>
            </ul>
          </div>
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
                Archiving...
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
