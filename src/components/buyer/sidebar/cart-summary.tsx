'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ShoppingCart, Trash2 } from 'lucide-react'
import { useOrder, useCurrency } from '@/lib/contexts'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useBuyerRepContext } from '@/hooks/use-buyer-rep-context'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface CartSummaryProps {
  className?: string
}

/**
 * Cart summary section for sidebar.
 * Shows item count, total, and actions.
 */
export function CartSummary({ className }: CartSummaryProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { repId, repNameParam, safeReturnTo, editOrder } = useBuyerRepContext()
  const { totalItems, totalPrice, editOrderId, isEditMode, isValidatingEditState, clearAll, clearEditMode } = useOrder()
  const { currency } = useCurrency()
  const [showClearConfirm, setShowClearConfirm] = useState(false)

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

  const handleClearCart = () => {
    if (isEditMode) {
      clearEditMode()
    } else {
      clearAll()
    }
    setShowClearConfirm(false)
  }

  return (
    <div className={className}>
      {/* Cart Stats */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {displayItems} item{displayItems !== 1 ? 's' : ''}
          </span>
        </div>
        {displayItems > 0 && (
          <span className="text-sm font-semibold">
            {formatCurrency(displayPrice, currency)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button asChild className="w-full" size="sm">
          <Link href={buildMyOrderHref()}>
            {displayItems > 0 ? 'View Order' : 'Review Order'}
          </Link>
        </Button>

        {displayItems > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Cart
          </Button>
        )}
      </div>

      {/* Clear Cart Confirmation Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Clear your cart?</DialogTitle>
            <DialogDescription>
              This will remove all {displayItems} item{displayItems !== 1 ? 's' : ''} from your cart.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearCart}>
              Clear Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
