'use client'

import { useState } from 'react'
import { useOrder } from '@/lib/contexts/order-context'
import { Button } from '@/components/ui/button'
import { Check, Trash2, Loader2, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionBackupToolbarProps {
  className?: string
}

/**
 * SessionBackupToolbar - displays local session backup status
 * 
 * This is a local-only safety net. Cart data is saved to localStorage.
 * Server drafts are created via explicit "Save Draft" action (future feature).
 */
export function SessionBackupToolbar({ className }: SessionBackupToolbarProps) {
  const { saveStatus, totalItems, clearDraft } = useOrder()
  const [clearing, setClearing] = useState(false)

  const handleClearCart = async () => {
    if (!confirm('Clear your cart and start fresh?')) return
    
    setClearing(true)
    try {
      await clearDraft()
    } finally {
      setClearing(false)
    }
  }

  // Don't show toolbar if cart is empty
  if (totalItems === 0) {
    return null
  }

  return (
    <div className={cn(
      'flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2',
      className
    )}>
      {/* Left side: Local backup info */}
      <div className="flex items-center gap-3 text-sm">
        {saveStatus === 'saved' && totalItems > 0 && (
          <>
            <Check className="size-4 text-green-600" />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">Local session backup</span>
              <span className="text-green-600"> · {totalItems} item{totalItems !== 1 ? 's' : ''} saved locally</span>
            </span>
          </>
        )}
        {saveStatus === 'idle' && totalItems > 0 && (
          <>
            <HardDrive className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {totalItems} item{totalItems !== 1 ? 's' : ''} in cart
            </span>
          </>
        )}
        {saveStatus === 'error' && (
          <>
            <HardDrive className="size-4 text-destructive" />
            <span className="text-destructive">Local backup failed</span>
          </>
        )}
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2">
        {/* Copy Link hidden - no server draft until explicit Save Draft action */}
        
        {totalItems > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCart}
            disabled={clearing}
            className="gap-2 text-muted-foreground hover:text-destructive"
          >
            {clearing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            <span>Clear Cart</span>
          </Button>
        )}
      </div>
    </div>
  )
}

// Keep DraftToolbar as alias for backwards compatibility during transition
export const DraftToolbar = SessionBackupToolbar
