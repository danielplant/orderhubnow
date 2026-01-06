'use client'

import { useState, useEffect } from 'react'
import { useOrder } from '@/lib/contexts/order-context'
import { Button } from '@/components/ui/button'
import { FileText, X } from 'lucide-react'

interface DraftRecoveryBannerProps {
  className?: string
}

const DRAFT_ID_KEY = 'draft-id'

export function DraftRecoveryBanner({ className }: DraftRecoveryBannerProps) {
  const { draftId, loadDraft, clearDraft, totalItems } = useOrder()
  const [storedDraftId, setStoredDraftId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)

  // Check for stored draft ID on mount
  useEffect(() => {
    const stored = localStorage.getItem(DRAFT_ID_KEY)
    if (stored && stored !== draftId) {
      setStoredDraftId(stored)
    }
  }, [draftId])

  // Don't show if:
  // - Already dismissed
  // - No stored draft different from current
  // - Current cart has items (user is actively working)
  // - Draft is already loaded
  if (dismissed || !storedDraftId || totalItems > 0 || draftId === storedDraftId) {
    return null
  }

  const handleResume = async () => {
    setLoading(true)
    try {
      const success = await loadDraft(storedDraftId)
      if (!success) {
        // Draft not found on server, clear local reference
        localStorage.removeItem(DRAFT_ID_KEY)
        setStoredDraftId(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleStartFresh = async () => {
    setLoading(true)
    try {
      await clearDraft()
      setDismissed(true)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  return (
    <div className={`relative rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 ${className || ''}`}>
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-2 p-1 text-blue-400 hover:text-blue-600"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
      
      <div className="flex items-start gap-3 pr-6">
        <FileText className="mt-0.5 size-5 text-blue-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900">
            You have a saved draft order
          </p>
          <p className="mt-0.5 text-sm text-blue-700">
            Draft <span className="font-mono">{storedDraftId}</span> was saved previously. Would you like to continue where you left off?
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={handleResume}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Resume Draft'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartFresh}
              disabled={loading}
            >
              Start Fresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
