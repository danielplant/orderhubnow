'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { Check, AlertTriangle, X, Loader2, Download } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface ImportProgress {
  type: 'progress' | 'complete' | 'error'
  page?: number
  totalEstimate?: number
  processed?: number
  created?: number
  updated?: number
  errors?: number
  errorDetails?: Array<{ email: string; error: string }>
  message?: string
}

interface CustomerImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

type ImportState = 'idle' | 'importing' | 'complete' | 'error'

// ============================================================================
// Component
// ============================================================================

export function CustomerImportModal({
  open,
  onOpenChange,
  onComplete,
}: CustomerImportModalProps) {
  const [state, setState] = React.useState<ImportState>('idle')
  const [progress, setProgress] = React.useState<ImportProgress | null>(null)
  const [showAllErrors, setShowAllErrors] = React.useState(false)
  const abortControllerRef = React.useRef<AbortController | null>(null)

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setState('idle')
      setProgress(null)
      setShowAllErrors(false)
    }
  }, [open])

  const handleStartImport = async () => {
    setState('importing')
    setProgress(null)

    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/customers/import-shopify', {
        method: 'POST',
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Import failed')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            try {
              const progressData: ImportProgress = JSON.parse(line)
              setProgress(progressData)

              if (progressData.type === 'complete') {
                setState('complete')
                onComplete?.()
              } else if (progressData.type === 'error') {
                setState('error')
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setState('idle')
        return
      }
      setState('error')
      setProgress({
        type: 'error',
        message: err instanceof Error ? err.message : 'Import failed',
      })
    }
  }

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    onOpenChange(false)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const handleDownloadErrors = () => {
    if (!progress?.errorDetails) return

    const content = progress.errorDetails
      .map((e) => `${e.email}: ${e.error}`)
      .join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-errors.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const progressPercent =
    progress?.totalEstimate && progress.page
      ? Math.min(95, Math.round((progress.page / progress.totalEstimate) * 100))
      : 0

  const displayedErrors = showAllErrors
    ? progress?.errorDetails
    : progress?.errorDetails?.slice(0, 3)

  return (
    <Dialog open={open} onOpenChange={state === 'importing' ? undefined : onOpenChange}>
      <DialogContent className="bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state === 'complete' && progress?.errors === 0 && (
              <Check className="h-5 w-5 text-success" />
            )}
            {state === 'complete' && (progress?.errors ?? 0) > 0 && (
              <AlertTriangle className="h-5 w-5 text-warning" />
            )}
            {state === 'error' && <X className="h-5 w-5 text-destructive" />}
            {state === 'importing' && (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            )}
            {state === 'idle' && 'Import Customers from Shopify'}
            {state === 'importing' && 'Importing Customers from Shopify'}
            {state === 'complete' && progress?.errors === 0 && 'Import Complete'}
            {state === 'complete' && (progress?.errors ?? 0) > 0 && 'Import Completed with Errors'}
            {state === 'error' && 'Import Failed'}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {/* Idle State - Confirmation */}
          {state === 'idle' && (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                This will import all customers from your Shopify store into MyOrderHub.
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Existing customers (matched by email) will be updated</li>
                <li>New customers will be created</li>
                <li>Customer addresses and contact info will be synced</li>
              </ul>
              <div className="flex gap-2 justify-end mt-6">
                <Button variant="secondary" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleStartImport}>Start Import</Button>
              </div>
            </div>
          )}

          {/* Importing State - Progress */}
          {state === 'importing' && progress && (
            <div className="space-y-6">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{progress.message}</span>
                  <span>{progressPercent}%</span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-md border border-border p-3">
                  <div className="text-2xl font-semibold">
                    {progress.processed?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Processed</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-2xl font-semibold text-success">
                    {progress.created?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Created</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-2xl font-semibold text-info">
                    {progress.updated?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Updated</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div
                    className={cn(
                      'text-2xl font-semibold',
                      (progress.errors ?? 0) > 0 ? 'text-destructive' : ''
                    )}
                  >
                    {progress.errors?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button variant="secondary" onClick={handleCancel}>
                  Cancel Import
                </Button>
              </div>
            </div>
          )}

          {/* Complete State - Success */}
          {state === 'complete' && progress?.errors === 0 && (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Successfully imported customers from Shopify.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="text-2xl font-semibold text-success">
                    {progress?.created?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">New customers created</div>
                </div>
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="text-2xl font-semibold text-info">
                    {progress?.updated?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Existing customers updated</div>
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <Button onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}

          {/* Complete with Errors State */}
          {state === 'complete' && (progress?.errors ?? 0) > 0 && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span>
                  Created:{' '}
                  <span className="font-semibold">{progress?.created?.toLocaleString()}</span>
                </span>
                <span>
                  Updated:{' '}
                  <span className="font-semibold">{progress?.updated?.toLocaleString()}</span>
                </span>
                <span>
                  Errors:{' '}
                  <span className="font-semibold text-destructive">
                    {progress?.errors?.toLocaleString()}
                  </span>
                </span>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto">
                <p className="text-sm font-medium mb-2">Failed to import:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {displayedErrors?.map((e, i) => (
                    <li key={i}>
                      <span className="text-foreground">{e.email}</span> — {e.error}
                    </li>
                  ))}
                </ul>
                {(progress?.errorDetails?.length ?? 0) > 3 && !showAllErrors && (
                  <button
                    onClick={() => setShowAllErrors(true)}
                    className="text-sm text-primary hover:underline mt-2"
                  >
                    Show all {progress?.errorDetails?.length} errors
                  </button>
                )}
              </div>

              <div className="flex gap-2 justify-between">
                <Button variant="ghost" size="sm" onClick={handleDownloadErrors}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Error Log
                </Button>
                <Button onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="space-y-4">
              <p className="text-destructive">{progress?.message || 'Import failed'}</p>

              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={handleClose}>
                  Close
                </Button>
                <Button onClick={handleStartImport}>Retry</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
