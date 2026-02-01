'use client'

/**
 * Export Progress Component
 *
 * Shows real-time progress for background export jobs.
 * Polls the status API and displays download button when complete.
 *
 * Phase 3: Durable Background Jobs
 */

import { useState, useEffect, useCallback } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Loader2, Download, AlertCircle, CheckCircle, XCircle, StopCircle } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface ExportJobStatus {
  id: string
  type: 'xlsx' | 'pdf'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: {
    percent: number | null
    step: string | null
    detail: string | null
  }
  timing: {
    createdAt: string
    startedAt: string | null
    completedAt: string | null
    durationMs: number | null
  }
  result: {
    filename: string | null
    sizeBytes: number | null
    downloadUrl: string | null
    expiresAt: string | null
  } | null
  metrics: {
    totalSkus: number
    imagesProcessed: number
    s3Hits: number
    shopifyFallbacks: number
    failures: number
  } | null
  error: string | null
}

interface ExportProgressProps {
  jobId: string
  onComplete?: (downloadUrl: string) => void
  onError?: (error: string) => void
  onClose?: () => void
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

// ============================================================================
// Component
// ============================================================================

export function ExportProgress({
  jobId,
  onComplete,
  onError,
  onClose,
}: ExportProgressProps) {
  const [status, setStatus] = useState<ExportJobStatus | null>(null)
  const [polling, setPolling] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Define pollStatus first since handleCancel depends on it
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/exports/${jobId}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch status')
      }
      const data: ExportJobStatus = await res.json()
      setStatus(data)

      if (data.status === 'completed') {
        setPolling(false)
        if (data.result?.downloadUrl) {
          onComplete?.(data.result.downloadUrl)
        }
      } else if (data.status === 'failed') {
        setPolling(false)
        onError?.(data.error || 'Export failed')
      } else if (data.status === 'cancelled') {
        setPolling(false)
      }
    } catch (err) {
      console.error('Polling error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    }
  }, [jobId, onComplete, onError])

  const handleCancel = useCallback(async () => {
    setCancelling(true)
    try {
      const res = await fetch(`/api/admin/exports/${jobId}/cancel`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to cancel')
      }
      // Immediately fetch updated status for instant feedback
      await pollStatus()
    } catch (err) {
      console.error('Cancel error:', err)
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setCancelling(false)
    }
  }, [jobId, pollStatus])

  useEffect(() => {
    if (!polling) return

    // Initial poll
    pollStatus()

    // Set up interval
    const interval = setInterval(pollStatus, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [polling, pollStatus])

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="font-medium">Error</span>
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    )
  }

  // Loading state
  if (!status) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  // Render based on status
  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center gap-2">
        {status.status === 'completed' && (
          <CheckCircle className="h-5 w-5 text-green-500" />
        )}
        {status.status === 'failed' && (
          <XCircle className="h-5 w-5 text-destructive" />
        )}
        {status.status === 'cancelled' && (
          <XCircle className="h-5 w-5 text-muted-foreground" />
        )}
        {(status.status === 'pending' || status.status === 'processing') && (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        )}
        <span className="font-medium">
          {status.status === 'pending' && 'Waiting in queue...'}
          {status.status === 'processing' && 'Generating export...'}
          {status.status === 'completed' && 'Export ready!'}
          {status.status === 'failed' && 'Export failed'}
          {status.status === 'cancelled' && 'Export cancelled'}
        </span>
      </div>

      {/* Progress bar for processing state */}
      {status.status === 'processing' && (
        <div className="space-y-2">
          <Progress value={status.progress.percent ?? 0} className="h-2" />
          <p className="text-sm text-muted-foreground">
            {status.progress.detail || status.progress.step || 'Processing...'}
          </p>
        </div>
      )}

      {/* Cancel button for pending/processing jobs */}
      {(status.status === 'pending' || status.status === 'processing') && (
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full"
        >
          {cancelling ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <StopCircle className="mr-2 h-4 w-4" />
          )}
          {cancelling ? 'Cancelling...' : 'Cancel Export'}
        </Button>
      )}

      {/* Error message */}
      {status.status === 'failed' && status.error && (
        <p className="text-sm text-destructive">{status.error}</p>
      )}

      {/* Success result */}
      {status.status === 'completed' && status.result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">File:</span>
            <span className="font-medium">{status.result.filename}</span>
          </div>
          {status.result.sizeBytes && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Size:</span>
              <span>{formatBytes(status.result.sizeBytes)}</span>
            </div>
          )}
          {status.timing.durationMs && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Generated in:</span>
              <span>{formatDuration(status.timing.durationMs)}</span>
            </div>
          )}

          {/* Metrics summary */}
          {status.metrics && (
            <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
              {status.metrics.totalSkus} SKUs • {status.metrics.imagesProcessed} images
              {status.metrics.shopifyFallbacks > 0 && (
                <span className="text-yellow-600">
                  {' '}
                  ({status.metrics.shopifyFallbacks} from Shopify)
                </span>
              )}
            </div>
          )}

          {/* Download button */}
          {status.result.downloadUrl && (
            <Button asChild className="w-full">
              <a href={status.result.downloadUrl} download>
                <Download className="mr-2 h-4 w-4" />
                Download {status.type.toUpperCase()}
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Close button for terminal states */}
      {(status.status === 'completed' ||
        status.status === 'failed' ||
        status.status === 'cancelled') &&
        onClose && (
          <Button variant="outline" onClick={onClose} className="w-full">
            Close
          </Button>
        )}
    </div>
  )
}
