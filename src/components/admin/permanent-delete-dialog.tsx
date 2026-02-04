'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
} from '@/components/ui'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'

export interface PermanentDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderCount: number
  shopifyOrderCount: number
  onConfirm: () => Promise<void>
}

export function PermanentDeleteDialog({
  open,
  onOpenChange,
  orderCount,
  shopifyOrderCount,
  onConfirm,
}: PermanentDeleteDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [confirmText, setConfirmText] = React.useState('')

  const isConfirmValid = confirmText.toUpperCase() === 'DELETE'

  const handleSubmit = async () => {
    if (!isConfirmValid) return
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
      setConfirmText('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Permanently Delete
          </DialogTitle>
          <DialogDescription>
            Delete {orderCount} order{orderCount > 1 ? 's' : ''} permanently?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
            <p className="font-medium text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              This action CANNOT be undone
            </p>
            <p className="text-red-700 mt-1">
              All order data will be permanently removed, including:
            </p>
            <ul className="list-disc list-inside text-red-700 mt-2 space-y-1">
              <li>Order items and line details</li>
              <li>Comments and notes</li>
              <li>Shipment records</li>
            </ul>
          </div>

          {shopifyOrderCount > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
              <p className="font-medium text-blue-800">
                {shopifyOrderCount} order{shopifyOrderCount > 1 ? 's are' : ' is'} in Shopify
              </p>
              <p className="text-blue-700 mt-1">
                {shopifyOrderCount > 1 ? 'They' : 'It'} will NOT be deleted in Shopify.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded">DELETE</span> to confirm:
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              disabled={isSubmitting}
              className="font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting || !isConfirmValid}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Forever
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
