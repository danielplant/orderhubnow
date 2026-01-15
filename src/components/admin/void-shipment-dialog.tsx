'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
} from '@/components/ui'
import { voidShipment } from '@/lib/data/actions/shipments'
import { VOID_REASONS, type VoidReason } from '@/lib/types/shipment'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface VoidShipmentDialogProps {
  shipmentId: string
  shipmentNumber: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VoidShipmentDialog({
  shipmentId,
  shipmentNumber,
  open,
  onOpenChange,
}: VoidShipmentDialogProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [reason, setReason] = React.useState<VoidReason | ''>('')
  const [notes, setNotes] = React.useState('')

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Please select a reason for voiding')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await voidShipment({
        shipmentId,
        reason,
        notes: notes.trim() || undefined,
      })

      if (result.success) {
        toast.success('Shipment voided successfully')
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error('Failed to void shipment', {
          description: result.error || 'An unexpected error occurred',
        })
      }
    } catch {
      toast.error('Failed to void shipment', {
        description: 'An unexpected error occurred',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setReason('')
      setNotes('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Void Shipment
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to void Shipment #{shipmentNumber}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
            <p className="font-medium text-amber-800 mb-2">This will:</p>
            <ul className="list-disc list-inside text-amber-700 space-y-1">
              <li>Mark the shipment as voided (not deleted)</li>
              <li>Restore item quantities back to remaining</li>
              <li>Update order status if needed</li>
              <li>Log this action in the activity history</li>
            </ul>
          </div>

          <div>
            <label className="text-sm font-medium">
              Reason for voiding <span className="text-destructive">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as VoidReason)}
              className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              disabled={isSubmitting}
            >
              <option value="">Select a reason...</option>
              {VOID_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">
              Additional notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details about why this shipment is being voided..."
              rows={3}
              className="mt-1.5 w-full rounded-md border border-input bg-background p-3 text-sm resize-none"
              disabled={isSubmitting}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            This action cannot be undone. The shipment record will be preserved for audit purposes.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting || !reason}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Voiding...
              </>
            ) : (
              'Void Shipment'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
