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
import { resendShipmentEmail } from '@/lib/data/actions/shipments'
import { Mail, Loader2 } from 'lucide-react'

interface ResendEmailDialogProps {
  shipmentId: string
  shipmentNumber: number
  recipient: 'customer' | 'rep'
  email: string
  hasTracking: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ResendEmailDialog({
  shipmentId,
  shipmentNumber,
  recipient,
  email,
  hasTracking,
  open,
  onOpenChange,
}: ResendEmailDialogProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [includeTracking, setIncludeTracking] = React.useState(hasTracking)
  const [attachInvoice, setAttachInvoice] = React.useState(false)

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setIncludeTracking(hasTracking)
      setAttachInvoice(false)
    }
  }, [open, hasTracking])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const result = await resendShipmentEmail({
        shipmentId,
        recipient,
        includeTracking,
        attachInvoice,
      })

      if (result.success) {
        toast.success('Email sent successfully', {
          description: `Shipment notification sent to ${email}`,
        })
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error('Failed to send email', {
          description: result.error || 'An unexpected error occurred',
        })
      }
    } catch {
      toast.error('Failed to send email', {
        description: 'An unexpected error occurred',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
    }
  }

  const recipientLabel = recipient === 'customer' ? 'Customer' : 'Sales Rep'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Resend Shipment Email
          </DialogTitle>
          <DialogDescription>
            Resend shipment confirmation for Shipment #{shipmentNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-sm">
              <span className="text-muted-foreground">To:</span>{' '}
              <span className="font-medium">{email}</span>
              <span className="text-muted-foreground ml-2">({recipientLabel})</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTracking}
                onChange={(e) => setIncludeTracking(e.target.checked)}
                disabled={!hasTracking || isSubmitting}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">
                Include tracking information
                {!hasTracking && (
                  <span className="text-muted-foreground ml-1">(no tracking available)</span>
                )}
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={attachInvoice}
                onChange={(e) => setAttachInvoice(e.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">Attach invoice PDF</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Email
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
