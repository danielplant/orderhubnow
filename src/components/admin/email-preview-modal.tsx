'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'
import { Mail, Paperclip, Loader2, X } from 'lucide-react'

interface EmailPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  previewData: {
    orderId: string
    items: Array<{
      orderItemId: string
      quantityShipped: number
      priceOverride?: number
    }>
    shippingCost: number
    carrier?: string
    trackingNumber?: string
    shipDate: string
    customerEmail: string
    attachInvoice?: boolean
    attachPackingSlip?: boolean
  } | null
}

interface PreviewResponse {
  subject: string
  html: string
  attachments: string[]
  to: string
  from: string
}

export function EmailPreviewModal({
  open,
  onOpenChange,
  previewData,
}: EmailPreviewModalProps) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null)

  // Fetch preview when modal opens
  React.useEffect(() => {
    if (open && previewData) {
      setIsLoading(true)
      setError(null)
      setPreview(null)

      fetch('/api/shipments/preview-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewData),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to load preview')
          }
          return res.json()
        })
        .then((data) => setPreview(data))
        .catch((err) => setError(err.message))
        .finally(() => setIsLoading(false))
    }
  }, [open, previewData])

  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Email Preview
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {preview && (
            <>
              {/* Email Header */}
              <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-2 text-sm flex-shrink-0">
                <div className="flex">
                  <span className="text-muted-foreground w-16">From:</span>
                  <span className="font-medium">{preview.from}</span>
                </div>
                <div className="flex">
                  <span className="text-muted-foreground w-16">To:</span>
                  <span className="font-medium">{preview.to}</span>
                </div>
                <div className="flex">
                  <span className="text-muted-foreground w-16">Subject:</span>
                  <span className="font-medium">{preview.subject}</span>
                </div>
                {preview.attachments.length > 0 && (
                  <div className="flex items-start">
                    <span className="text-muted-foreground w-16">Attach:</span>
                    <div className="flex flex-wrap gap-2">
                      {preview.attachments.map((att) => (
                        <span
                          key={att}
                          className="inline-flex items-center gap-1 bg-background px-2 py-0.5 rounded text-xs"
                        >
                          <Paperclip className="h-3 w-3" />
                          {att}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Email Body */}
              <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={preview.html}
                  title="Email Preview"
                  className="w-full h-full min-h-[400px]"
                  sandbox="allow-same-origin"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-4 flex-shrink-0">
          <Button variant="outline" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
