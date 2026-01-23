'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useOrder } from '@/lib/contexts/order-context'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface JourneyToggleProps {
  buildHref: (basePath: string) => string
  className?: string
}

/**
 * ATS / Pre-Order toggle for switching between order types.
 * Shows confirmation dialog when switching with items in cart.
 */
export function JourneyToggle({ buildHref, className }: JourneyToggleProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { totalItems } = useOrder()

  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false)
  const [pendingJourney, setPendingJourney] = useState<'ats' | 'pre-order' | null>(null)

  const isATS = pathname.startsWith('/buyer/ats')
  const isPreOrder = pathname.startsWith('/buyer/pre-order')

  const handleJourneySwitch = (journey: 'ats' | 'pre-order') => {
    // Don't switch if already on that journey
    if ((journey === 'ats' && isATS) || (journey === 'pre-order' && isPreOrder)) {
      return
    }

    if (totalItems > 0) {
      setPendingJourney(journey)
      setShowSwitchConfirm(true)
    } else {
      const target = journey === 'ats' ? '/buyer/ats' : '/buyer/pre-order'
      router.push(buildHref(target))
    }
  }

  const confirmJourneySwitch = () => {
    if (pendingJourney) {
      const target = pendingJourney === 'ats' ? '/buyer/ats' : '/buyer/pre-order'
      router.push(buildHref(target))
    }
    setShowSwitchConfirm(false)
    setPendingJourney(null)
  }

  return (
    <>
      <div className={cn('flex items-center gap-1 p-1 bg-secondary rounded-full', className)}>
        <button
          onClick={() => handleJourneySwitch('ats')}
          className={cn(
            'flex-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors',
            isATS
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-pressed={isATS}
        >
          ATS
        </button>
        <button
          onClick={() => handleJourneySwitch('pre-order')}
          className={cn(
            'flex-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors',
            isPreOrder
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-pressed={isPreOrder}
        >
          Pre-Order
        </button>
      </div>

      {/* Journey Switch Confirmation Dialog */}
      <Dialog open={showSwitchConfirm} onOpenChange={setShowSwitchConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Switch order type?</DialogTitle>
            <DialogDescription>
              You have {totalItems} item{totalItems !== 1 ? 's' : ''} in your cart.
              Mixing ATS and Pre-Order items in the same order may cause processing issues.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSwitchConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={confirmJourneySwitch}>
              Continue Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
