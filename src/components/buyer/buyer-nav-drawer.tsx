'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, Compass } from 'lucide-react'
import { useBuyerRepContext } from '@/hooks/use-buyer-rep-context'
import { getPortalReturnLabel } from '@/lib/utils/rep-context'
import { useOrder } from '@/lib/contexts/order-context'
import { BRAND_NAME, APP_NAME } from '@/lib/constants/brand'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { JourneyToggle } from './sidebar/journey-toggle'
import { CartSummary } from './sidebar/cart-summary'
import { CurrencyToggle } from './currency-toggle'

interface BuyerNavDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface NavLinkProps {
  href: string
  active: boolean
  onClick?: () => void
  children: React.ReactNode
}

function NavLink({ href, active, onClick, children }: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'block px-3 py-2.5 text-sm rounded-md transition-colors',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {children}
    </Link>
  )
}

/**
 * Mobile navigation drawer for buyer portal.
 * Slides in from the left with full navigation, cart, and settings.
 */
export function BuyerNavDrawer({ open, onOpenChange }: BuyerNavDrawerProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    repId,
    repNameParam,
    isRepContext,
    repName,
    returnTo,
    safeReturnTo,
    editOrder,
    isLoading,
    buildHref,
  } = useBuyerRepContext()
  const { totalItems, editOrderId, isEditMode, formData } = useOrder()

  const isATS = pathname.startsWith('/buyer/ats')
  const isPreOrderParam = searchParams.get('isPreOrder') === 'true'
  const isPreOrder = pathname.startsWith('/buyer/pre-order') || isPreOrderParam
  const isMyOrder = pathname === '/buyer/my-order'
  const isSelectJourney = pathname === '/buyer/select-journey'

  // Show journey toggle in rep context when in ordering flow
  const showJourneyToggle = isRepContext && (isATS || isPreOrder || isMyOrder)

  // Build my-order href preserving all context and order type
  const buildMyOrderHref = () => {
    const params = new URLSearchParams()
    if (isPreOrder) params.set('isPreOrder', 'true')
    if (repId) params.set('repId', repId)
    if (repNameParam) params.set('repName', repNameParam)
    if (safeReturnTo) params.set('returnTo', safeReturnTo)
    if (editOrder) params.set('editOrder', editOrder)
    if (isEditMode && editOrderId && !editOrder) params.set('editOrder', editOrderId)
    const qs = params.toString()
    return `/buyer/my-order${qs ? `?${qs}` : ''}`
  }

  const closeDrawer = () => onOpenChange(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Compass className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-bold tracking-tight">{BRAND_NAME}</span>
              <span className="text-xs text-muted-foreground font-normal">{APP_NAME}</span>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Rep Context */}
        {isRepContext && (
          <div className="px-4 py-3 bg-primary/5 border-b border-primary/10">
            <p className="text-sm font-medium text-primary">
              {isLoading ? 'Loading...' : `Rep: ${repName || 'Unknown'}`}
            </p>
            {formData?.storeName && (
              <p className="text-xs text-muted-foreground mt-1">
                Customer: {formData.storeName}
              </p>
            )}
            <Link
              href={returnTo}
              onClick={closeDrawer}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1.5 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              {getPortalReturnLabel(returnTo)}
            </Link>
          </div>
        )}

        {/* Journey Toggle */}
        {showJourneyToggle && (
          <div className="px-4 py-3 border-b border-border">
            <JourneyToggle buildHref={buildHref} />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLink
            href={buildHref('/buyer/select-journey')}
            active={isSelectJourney}
            onClick={closeDrawer}
          >
            Select Journey
          </NavLink>

          {(isATS || (!isPreOrder && !isMyOrder && !isSelectJourney)) && (
            <NavLink
              href={buildHref('/buyer/ats')}
              active={isATS && !isMyOrder}
              onClick={closeDrawer}
            >
              ATS Collections
            </NavLink>
          )}

          {isPreOrder && (
            <NavLink
              href={buildHref('/buyer/pre-order')}
              active={isPreOrder && !isMyOrder}
              onClick={closeDrawer}
            >
              Pre-Order Collections
            </NavLink>
          )}

          <NavLink
            href={buildMyOrderHref()}
            active={isMyOrder}
            onClick={closeDrawer}
          >
            My Order {totalItems > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                {totalItems}
              </span>
            )}
          </NavLink>
        </nav>

        {/* Cart Summary */}
        <div className="p-4 border-t border-border">
          <CartSummary />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Currency</span>
            <CurrencyToggle size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Systems Operational</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
