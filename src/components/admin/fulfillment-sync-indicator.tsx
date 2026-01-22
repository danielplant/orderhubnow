'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { syncAllPendingFulfillments } from '@/lib/data/actions/fulfillment-sync'

interface FulfillmentSyncIndicatorProps {
  lastSyncedAt: Date | null
  pendingOrdersCount: number
}

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'never'

  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export function FulfillmentSyncIndicator({
  lastSyncedAt,
  pendingOrdersCount,
}: FulfillmentSyncIndicatorProps) {
  const router = useRouter()
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [displayTime, setDisplayTime] = React.useState(() => formatTimeAgo(lastSyncedAt))

  // Update display time periodically
  React.useEffect(() => {
    setDisplayTime(formatTimeAgo(lastSyncedAt))
    const interval = setInterval(() => {
      setDisplayTime(formatTimeAgo(lastSyncedAt))
    }, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [lastSyncedAt])

  const handleSync = async () => {
    if (isSyncing) return

    setIsSyncing(true)

    // Show immediate feedback
    const toastId = toast.loading(
      `Syncing fulfillments for ${pendingOrdersCount} order${pendingOrdersCount !== 1 ? 's' : ''}...`,
      { description: 'Checking Shopify for tracking numbers' }
    )

    try {
      const result = await syncAllPendingFulfillments()

      // Dismiss loading toast
      toast.dismiss(toastId)

      if (result.success) {
        if (result.shipmentsCreated > 0) {
          toast.success(`Synced ${result.ordersProcessed} orders`, {
            description: `${result.shipmentsCreated} new shipment${result.shipmentsCreated > 1 ? 's' : ''} created`,
          })
        } else {
          toast.success(`Checked ${result.ordersProcessed} orders`, {
            description: 'No new fulfillments found',
          })
        }

        if (result.errors.length > 0) {
          toast.warning(`${result.errors.length} order${result.errors.length > 1 ? 's' : ''} had errors`, {
            description: result.errors[0]?.error,
          })
        }

        // Warn if Shopify status updates failed (shipments still synced)
        if (result.statusSyncErrors && result.statusSyncErrors.length > 0) {
          toast.warning(`${result.statusSyncErrors.length} Shopify status update(s) failed`, {
            description: 'Shipments synced, but some status updates failed',
          })
        }

        // Refresh the page to show updated data
        router.refresh()
        setDisplayTime('just now')
      } else {
        toast.error('Sync failed', {
          description: result.errors[0]?.error || 'Unknown error',
        })
      }
    } catch (error) {
      toast.dismiss(toastId)
      toast.error('Sync failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  // Don't show if no orders have been transferred to Shopify
  if (pendingOrdersCount === 0 && !lastSyncedAt) {
    return null
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Fulfillments synced {displayTime}</span>
      <button
        type="button"
        onClick={handleSync}
        disabled={isSyncing}
        className={cn(
          'p-1 rounded hover:bg-muted transition-colors',
          isSyncing && 'cursor-not-allowed'
        )}
        title={isSyncing ? 'Syncing...' : 'Sync fulfillments from Shopify'}
      >
        <RefreshCw
          className={cn(
            'h-4 w-4',
            isSyncing && 'animate-spin'
          )}
        />
      </button>
    </div>
  )
}
