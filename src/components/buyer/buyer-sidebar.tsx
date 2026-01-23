'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Compass } from 'lucide-react'
import { useBuyerRepContext } from '@/hooks/use-buyer-rep-context'
import { useOrder } from '@/lib/contexts/order-context'
import { BRAND_NAME, APP_NAME } from '@/lib/constants/brand'
import { cn } from '@/lib/utils'
import { RepContextBanner } from './sidebar/rep-context-banner'
import { JourneyToggle } from './sidebar/journey-toggle'
import { CartSummary } from './sidebar/cart-summary'
import { CurrencyToggle } from './currency-toggle'

interface NavLinkProps {
  href: string
  active: boolean
  children: React.ReactNode
}

function NavLink({ href, active, children }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'block px-3 py-2 text-sm rounded-md transition-colors',
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
 * Desktop sidebar for buyer portal.
 * Contains navigation, cart, currency toggle, and rep context.
 */
export function BuyerSidebar() {
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

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <Link
          href={buildHref('/buyer/select-journey')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">{BRAND_NAME}</span>
            <span className="text-xs text-muted-foreground">{APP_NAME}</span>
          </div>
        </Link>
      </div>

      {/* Rep Context Banner */}
      {isRepContext && (
        <RepContextBanner
          repName={repName}
          returnTo={returnTo}
          isLoading={isLoading}
          storeName={formData?.storeName || null}
        />
      )}

      {/* Journey Toggle */}
      {showJourneyToggle && (
        <div className="px-4 py-3 border-b border-border">
          <JourneyToggle buildHref={buildHref} />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <NavLink href={buildHref('/buyer/select-journey')} active={isSelectJourney}>
          Select Journey
        </NavLink>

        {(isATS || (!isPreOrder && !isMyOrder && !isSelectJourney)) && (
          <NavLink href={buildHref('/buyer/ats')} active={isATS && !isMyOrder}>
            ATS Collections
          </NavLink>
        )}

        {isPreOrder && (
          <NavLink href={buildHref('/buyer/pre-order')} active={isPreOrder && !isMyOrder}>
            Pre-Order Collections
          </NavLink>
        )}

        <NavLink href={buildMyOrderHref()} active={isMyOrder}>
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
    </aside>
  )
}
