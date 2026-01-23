'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Compass, ShoppingCart, Menu, User } from 'lucide-react'
import { useBuyerRepContext } from '@/hooks/use-buyer-rep-context'
import { useOrder, useCurrency } from '@/lib/contexts'
import { formatCurrency, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BRAND_NAME } from '@/lib/constants/brand'

interface BuyerHeaderCompactProps {
  onMenuClick: () => void
  className?: string
}

/**
 * Compact header for mobile/tablet buyer portal.
 * Shows logo, rep badge (if applicable), cart button, and menu button.
 */
export function BuyerHeaderCompact({ onMenuClick, className }: BuyerHeaderCompactProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    repId,
    repNameParam,
    safeReturnTo,
    editOrder,
    isRepContext,
    repName,
    isLoading,
    buildHref,
  } = useBuyerRepContext()
  const { totalItems, totalPrice, editOrderId, isEditMode, isValidatingEditState } = useOrder()
  const { currency } = useCurrency()

  // During edit state validation, suppress stale cart data
  const displayItems = (isValidatingEditState && isEditMode) ? 0 : totalItems
  const displayPrice = (isValidatingEditState && isEditMode) ? 0 : totalPrice

  const isPreOrderParam = searchParams.get('isPreOrder') === 'true'
  const isPreOrder = pathname.startsWith('/buyer/pre-order') || isPreOrderParam

  // Build my-order href preserving all context
  const buildMyOrderHref = () => {
    const params = new URLSearchParams()
    if (isPreOrder) params.set('isPreOrder', 'true')

    if (repId) params.set('repId', repId)
    if (repNameParam) params.set('repName', repNameParam)
    if (safeReturnTo) params.set('returnTo', safeReturnTo)

    if (editOrder) {
      params.set('editOrder', editOrder)
    } else if (isEditMode && editOrderId) {
      params.set('editOrder', editOrderId)
    }

    const qs = params.toString()
    return `/buyer/my-order${qs ? `?${qs}` : ''}`
  }

  return (
    <header
      className={cn(
        'flex lg:hidden items-center justify-between h-14 px-4 border-b border-border bg-background sticky top-0 z-50',
        className
      )}
    >
      {/* Left: Logo */}
      <Link
        href={buildHref('/buyer/select-journey')}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Compass className="h-5 w-5 text-primary" />
        </div>
        <span className="text-sm font-bold tracking-tight">{BRAND_NAME}</span>
      </Link>

      {/* Right: Rep Badge + Cart + Menu */}
      <div className="flex items-center gap-2">
        {/* Rep Context Badge */}
        {isRepContext && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/5 rounded-full border border-primary/10">
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary max-w-[80px] truncate">
              {isLoading ? '...' : repName || 'Rep'}
            </span>
          </div>
        )}

        {/* Cart Button */}
        <Button
          variant={displayItems > 0 ? 'default' : 'outline'}
          size="sm"
          asChild
        >
          <Link href={buildMyOrderHref()}>
            <ShoppingCart className="h-4 w-4" />
            {displayItems > 0 ? (
              <>
                <span>{displayItems}</span>
                <span className="mx-1 opacity-50">|</span>
                <span>{formatCurrency(displayPrice, currency)}</span>
              </>
            ) : (
              <span className="hidden sm:inline">Order</span>
            )}
          </Link>
        </Button>

        {/* Menu Button */}
        <Button variant="ghost" size="icon" onClick={onMenuClick} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
