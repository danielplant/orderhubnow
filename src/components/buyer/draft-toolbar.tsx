'use client'

import { useState } from 'react'
import { useOrder } from '@/lib/contexts/order-context'
import { Button } from '@/components/ui/button'
import { Copy, Check, Trash2, Loader2, Cloud, CloudOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DraftToolbarProps {
  className?: string
}

export function DraftToolbar({ className }: DraftToolbarProps) {
  const { draftId, saveStatus, lastSaved, totalItems, clearDraft, getDraftUrl } = useOrder()
  const [copied, setCopied] = useState(false)
  const [clearing, setClearing] = useState(false)

  const handleCopyLink = async () => {
    const url = getDraftUrl()
    if (!url) return

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleClearCart = async () => {
    if (!confirm('Clear your cart and start fresh?')) return
    
    setClearing(true)
    try {
      await clearDraft()
    } finally {
      setClearing(false)
    }
  }

  // Format last saved time
  const getLastSavedText = () => {
    if (!lastSaved) return null
    
    const now = new Date()
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000)
    
    if (diff < 5) return 'Just now'
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Don't show toolbar if cart is empty and no draft exists
  if (totalItems === 0 && !draftId) {
    return null
  }

  return (
    <div className={cn(
      'flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2',
      className
    )}>
      {/* Left side: Draft info */}
      <div className="flex items-center gap-3 text-sm">
        {saveStatus === 'saving' && (
          <>
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Saving...</span>
          </>
        )}
        {saveStatus === 'saved' && draftId && (
          <>
            <Cloud className="size-4 text-green-600" />
            <span className="text-muted-foreground">
              Draft <span className="font-mono font-medium text-foreground">{draftId}</span>
              {lastSaved && (
                <span className="text-muted-foreground"> · Saved {getLastSavedText()}</span>
              )}
            </span>
          </>
        )}
        {saveStatus === 'error' && (
          <>
            <CloudOff className="size-4 text-destructive" />
            <span className="text-destructive">Failed to save</span>
          </>
        )}
        {saveStatus === 'idle' && totalItems > 0 && (
          <span className="text-muted-foreground">
            {totalItems} item{totalItems !== 1 ? 's' : ''} in cart
          </span>
        )}
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2">
        {draftId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            disabled={copied}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="size-4 text-green-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-4" />
                <span>Copy Link</span>
              </>
            )}
          </Button>
        )}
        
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
