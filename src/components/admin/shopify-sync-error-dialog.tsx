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
import { AlertTriangle, Loader2, RefreshCw, XCircle, ArrowRight } from 'lucide-react'

export type SyncErrorAction = 'retry' | 'proceed' | 'abort'

export interface ShopifySyncErrorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderNumber: string
  errorMessage: string
  action: 'cancel' | 'close'
  onAction: (action: SyncErrorAction) => Promise<void>
}

export function ShopifySyncErrorDialog({
  open,
  onOpenChange,
  orderNumber,
  errorMessage,
  action,
  onAction,
}: ShopifySyncErrorDialogProps) {
  const [isRetrying, setIsRetrying] = React.useState(false)
  const [isProceeding, setIsProceeding] = React.useState(false)

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await onAction('retry')
    } finally {
      setIsRetrying(false)
    }
  }

  const handleProceedAnyway = async () => {
    setIsProceeding(true)
    try {
      await onAction('proceed')
    } finally {
      setIsProceeding(false)
    }
  }

  const handleAbort = async () => {
    if (!isRetrying && !isProceeding) {
      await onAction('abort')
      onOpenChange(false)
    }
  }

  const isLoading = isRetrying || isProceeding
  const actionLabel = action === 'cancel' ? 'cancellation' : 'close'

  return (
    <Dialog open={open} onOpenChange={() => !isLoading && handleAbort()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Shopify Sync Failed
          </DialogTitle>
          <DialogDescription>
            Failed to sync order {orderNumber} {actionLabel} to Shopify.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
            <p className="font-medium text-red-800 mb-1">Error from Shopify:</p>
            <p className="text-red-700 font-mono text-xs">{errorMessage}</p>
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium mb-2">What would you like to do?</p>
            <ul className="text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <RefreshCw className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Retry</strong> - Try syncing to Shopify again</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Proceed Anyway</strong> - Update locally only (Shopify will be out of sync)</span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Abort</strong> - Cancel the operation entirely</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleAbort} disabled={isLoading}>
            Abort
          </Button>
          <Button
            variant="secondary"
            onClick={handleProceedAnyway}
            disabled={isLoading}
          >
            {isProceeding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Proceed Anyway'
            )}
          </Button>
          <Button
            onClick={handleRetry}
            disabled={isLoading}
          >
            {isRetrying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
