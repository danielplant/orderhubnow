'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOrder } from '@/lib/contexts/order-context'
import { useCurrency } from '@/lib/contexts/currency-context'
import { OrderForm } from '@/components/buyer/order-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Trash2, Link2, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { OrderForEditing } from '@/lib/data/queries/orders'

interface SkuData {
  skuVariantId: number
  priceCAD: number
  priceUSD: number
  description: string
}

interface MyOrderClientProps {
  reps: Array<{ id: string; name: string; code: string }>
  skuMap: Record<string, SkuData>
  isPreOrder?: boolean
  existingOrder?: OrderForEditing | null
  returnTo?: string
  repContext?: { repId: string } | null
  draftParam?: string | null
}

export function MyOrderClient({
  reps,
  skuMap,
  isPreOrder = false,
  existingOrder = null,
  returnTo = '/buyer/select-journey',
  repContext = null,
  draftParam = null,
}: MyOrderClientProps) {
  const router = useRouter()
  const { orders, totalItems, removeItem, restoreFromDraftLink, generateDraftLink } = useOrder()
  const { currency } = useCurrency()
  const [linkCopied, setLinkCopied] = useState(false)

  // Restore from draft link parameter (runs once when draftParam is set)
  useEffect(() => {
    if (draftParam) {
      const restored = restoreFromDraftLink(draftParam)
      if (restored) {
        toast.success('Draft order restored successfully!')
      } else {
        toast.error('Failed to restore draft order - link may be invalid or expired')
      }
      // Clean up URL by removing draft parameter
      const url = new URL(window.location.href)
      url.searchParams.delete('draft')
      router.replace(url.pathname + url.search)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps intentional - only run once on mount

  // Copy draft order link handler
  const handleCopyDraftLink = async () => {
    const link = generateDraftLink()
    if (!link) {
      // generateDraftLink returns null for empty cart or if URL would be too long
      if (totalItems === 0) {
        toast.error('No items in cart to share')
      } else {
        toast.error('Cart is too large to share as a link. Please reduce items or submit the order.')
      }
      return
    }

    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      toast.success('Draft order link copied! Share it to continue this order later.')
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  // Determine if we're in edit mode
  const isEditMode = !!existingOrder

  // In edit mode, use existing order items; otherwise use cart
  const cartItems = useMemo(() => {
    if (isEditMode && existingOrder) {
      // Use items from existing order
      return existingOrder.items.map((item) => ({
        productId: item.sku, // Use SKU as productId for edit mode
        sku: item.sku,
        skuVariantId: item.skuVariantId,
        quantity: item.quantity,
        price: item.price,
        description: item.description,
      }))
    }

    // Normal cart flow
    const items: Array<{
      productId: string
      sku: string
      skuVariantId: number
      quantity: number
      price: number
      description: string
    }> = []

    Object.entries(orders).forEach(([productId, skuQuantities]) => {
      Object.entries(skuQuantities).forEach(([sku, quantity]) => {
        const skuData = skuMap[sku]
        if (skuData && quantity > 0) {
          items.push({
            productId,
            sku,
            skuVariantId: skuData.skuVariantId,
            quantity,
            price: currency === 'CAD' ? skuData.priceCAD : skuData.priceUSD,
            description: skuData.description,
          })
        }
      })
    })

    return items
  }, [orders, skuMap, currency, isEditMode, existingOrder])

  // For edit mode, use the order's currency; otherwise use context
  const effectiveCurrency = isEditMode && existingOrder ? existingOrder.currency : currency

  // Calculate totals
  const orderTotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  // Build rep query string for navigation
  const repQuery = repContext?.repId 
    ? `?repId=${repContext.repId}${returnTo !== '/buyer/select-journey' ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`
    : ''

  // Redirect to collections if cart is empty (only in non-edit mode)
  useEffect(() => {
    if (!isEditMode && totalItems === 0) {
      router.replace(`/buyer/select-journey${repQuery}`)
    }
  }, [totalItems, router, isEditMode, repQuery])

  // Show redirecting state while cart is empty (only in non-edit mode)
  if (!isEditMode && totalItems === 0) {
    return (
      <div className="container mx-auto py-16 px-4">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">
            {draftParam ? 'Restoring your draft order...' : 'Redirecting to collections...'}
          </p>
        </div>
      </div>
    )
  }

  // In edit mode, show error if order not editable
  if (isEditMode && !existingOrder) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Order Not Found</h1>
          <p className="text-muted-foreground mb-4">
            The order you&apos;re trying to edit was not found or is no longer editable.
          </p>
          <Button onClick={() => router.push(returnTo)}>Go Back</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">
        {isEditMode ? `Edit Order ${existingOrder?.orderNumber}` : 'Review Your Order'}
      </h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Order Summary - Right side on desktop */}
        <div className="lg:col-span-1 lg:order-2">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {cartItems.length} item{cartItems.length !== 1 ? 's' : ''} in order
              </div>

              <div className="divide-y max-h-[400px] overflow-y-auto">
                {cartItems.map((item) => (
                  <div
                    key={item.sku}
                    className="py-3 flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.sku}
                      </div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.description}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {item.quantity} x {formatCurrency(item.price, effectiveCurrency)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {formatCurrency(item.price * item.quantity, effectiveCurrency)}
                      </span>
                      {!isEditMode && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeItem(item.productId, item.sku)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total ({effectiveCurrency})</span>
                  <span>{formatCurrency(orderTotal, effectiveCurrency)}</span>
                </div>
              </div>

              {!isEditMode && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push((isPreOrder ? '/buyer/pre-order' : '/buyer/ats') + repQuery)}
                  >
                    Continue Shopping
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={handleCopyDraftLink}
                  >
                    {linkCopied ? (
                      <Check className="h-4 w-4 text-green-500 mr-2" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    {linkCopied ? 'Link Copied!' : 'Copy Draft Link'}
                  </Button>
                </div>
              )}

              {isEditMode && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(returnTo)}
                >
                  Cancel Edit
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Customer Form - Left side on desktop */}
        <div className="lg:col-span-2 lg:order-1">
          <OrderForm
            currency={effectiveCurrency}
            reps={reps}
            cartItems={cartItems}
            isPreOrder={isPreOrder}
            editMode={isEditMode}
            existingOrder={existingOrder}
            returnTo={returnTo}
            repContext={repContext}
          />
        </div>
      </div>
    </div>
  )
}
