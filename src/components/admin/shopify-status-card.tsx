'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { ShopifySyncStatus } from '@/lib/types/shopify'
import { Check, X, Clock, RefreshCw, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface SyncRunInfo {
  id: string
  syncType: string
  status: string
  startedAt: string
  completedAt: string | null
  itemCount: number | null
  errorMessage: string | null
}

interface ExtendedSyncStatus extends ShopifySyncStatus {
  lastRun?: SyncRunInfo | null
  syncInProgress?: boolean
}

interface ShopifyStatusCardProps {
  status: ExtendedSyncStatus
}

type SyncState = 'idle' | 'syncing' | 'complete' | 'error'

export function ShopifyStatusCard({ status }: ShopifyStatusCardProps) {
  const router = useRouter()
  const [syncState, setSyncState] = React.useState<SyncState>(
    status.syncInProgress ? 'syncing' : 'idle'
  )
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null)
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null)

  // Clean up polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Start polling if sync is already in progress when component mounts
  React.useEffect(() => {
    if (status.syncInProgress && syncState === 'syncing') {
      startPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startPolling = () => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/shopify/sync')
        const data = await response.json()

        if (data.lastRun?.status === 'completed') {
          setSyncState('complete')
          setSyncMessage(`Sync complete! ${data.lastRun.itemCount?.toLocaleString() ?? 0} items processed.`)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          // Refresh the page data
          router.refresh()
        } else if (data.lastRun?.status === 'failed' || data.lastRun?.status === 'timeout') {
          setSyncState('error')
          setSyncMessage(data.lastRun.errorMessage || 'Sync failed')
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        }
      } catch (err) {
        console.error('Error polling sync status:', err)
      }
    }, 5000) // Poll every 5 seconds

    // Stop polling after 15 minutes max
    setTimeout(() => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
        if (syncState === 'syncing') {
          setSyncState('error')
          setSyncMessage('Polling timed out. Check back later for results.')
        }
      }
    }, 15 * 60 * 1000)
  }

  const handleSyncNow = async () => {
    if (!status.isConnected) return

    setSyncState('syncing')
    setSyncMessage('Starting sync...')

    try {
      const response = await fetch('/api/shopify/sync', { method: 'POST' })
      const data = await response.json()

      if (data.status === 'started') {
        setSyncMessage('Sync in progress. This page will update when complete.')
        startPolling()
      } else if (data.status === 'in_progress') {
        setSyncMessage('A sync is already in progress. Please wait.')
        startPolling()
      } else if (data.error) {
        setSyncState('error')
        setSyncMessage(data.error)
      } else {
        setSyncState('error')
        setSyncMessage('Failed to start sync')
      }
    } catch (err) {
      setSyncState('error')
      setSyncMessage(err instanceof Error ? err.message : 'Failed to start sync')
    }
  }

  const statusIcon = status.isConnected ? (
    <Check className="h-5 w-5 text-success" />
  ) : (
    <X className="h-5 w-5 text-error" />
  )

  const lastSyncText = status.lastSyncTime
    ? new Date(status.lastSyncTime).toLocaleString()
    : 'Never'

  const syncStatusBadge = {
    success: { label: 'Success', className: 'bg-ats-bg text-ats-text' },
    partial: { label: 'Partial', className: 'bg-warning/10 text-warning' },
    failed: { label: 'Failed', className: 'bg-destructive/10 text-destructive' },
    never: { label: 'Never synced', className: 'bg-muted text-muted-foreground' },
  }[status.lastSyncStatus]

  const getSyncButtonContent = () => {
    switch (syncState) {
      case 'syncing':
        return (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Syncing...</span>
          </>
        )
      case 'complete':
        return (
          <>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>Complete</span>
          </>
        )
      case 'error':
        return (
          <>
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span>Retry</span>
          </>
        )
      default:
        return (
          <>
            <RefreshCw className="h-4 w-4" />
            <span>Sync Now</span>
          </>
        )
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Connection Status */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              status.isConnected ? 'bg-ats-bg' : 'bg-destructive/10'
            )}
          >
            {statusIcon}
          </div>
          <div>
            <p className="font-medium">
              {status.isConnected ? 'Connected to Shopify' : 'Not Connected'}
            </p>
            <p className="text-sm text-muted-foreground">
              {status.isConnected
                ? 'API credentials configured'
                : 'Configure SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN'}
            </p>
          </div>
        </div>

        {/* Last Sync */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Last Sync</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{lastSyncText}</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  syncStatusBadge.className
                )}
              >
                {syncStatusBadge.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-md bg-muted/30 p-4">
          <p className="text-2xl font-bold">{status.productsSynced.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">Products Synced</p>
        </div>
        <div className="rounded-md bg-muted/30 p-4">
          <p className="text-2xl font-bold">{status.customersSynced.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">Customers Synced</p>
        </div>
        <div className="rounded-md bg-muted/30 p-4">
          <p className={cn('text-2xl font-bold', status.pendingSync > 0 && 'text-warning')}>
            {status.pendingSync.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground">Pending Review</p>
        </div>
        <div className="rounded-md bg-muted/30 p-4 flex flex-col items-center justify-center gap-1">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={!status.isConnected || syncState === 'syncing'}
            className={cn(
              'flex items-center gap-2 text-sm font-medium transition-colors',
              syncState === 'syncing'
                ? 'text-muted-foreground cursor-not-allowed'
                : 'text-muted-foreground hover:text-foreground',
              !status.isConnected && 'opacity-50 cursor-not-allowed'
            )}
          >
            {getSyncButtonContent()}
          </button>
        </div>
      </div>

      {/* Sync Message */}
      {syncMessage && (
        <div
          className={cn(
            'mt-4 rounded-md px-4 py-2 text-sm',
            syncState === 'error'
              ? 'bg-destructive/10 text-destructive'
              : syncState === 'complete'
                ? 'bg-ats-bg text-ats-text'
                : 'bg-muted text-muted-foreground'
          )}
        >
          {syncMessage}
        </div>
      )}
    </div>
  )
}
