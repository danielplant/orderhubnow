'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useOrder } from '@/lib/contexts/order-context'
import { useCurrency } from '@/lib/contexts/currency-context'
import { OrderForm } from '@/components/buyer/order-form'
import { DraftToolbar } from '@/components/buyer/draft-toolbar'
import { DraftRecoveryBanner } from '@/components/buyer/draft-recovery-banner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
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
  draftId?: string | null
}

export function MyOrderClient({
  reps,
  skuMap,
  isPreOrder = false,
  existingOrder = null,
  returnTo = '/buyer/select-journey',
  repContext = null,
  draftId: urlDraftId = null,
}: MyOrderClientProps) {
  const router = useRouter()
  const { orders, totalItems, removeItem, loadDraft, draftId } = useOrder()
  const { currency } = useCurrency()

  // Load draft from URL param if present
  useEffect(() => {
    if (urlDraftId && urlDraftId !== draftId) {
      loadDraft(urlDraftId)
    }
  }, [urlDraftId, draftId, loadDraft])

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

  // Don't render form until we've checked cart (only in non-edit mode)
  if (!isEditMode && totalItems === 0) {
    return null
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
      {/* Draft recovery banner - only show when not in edit mode */}
      {!isEditMode && <DraftRecoveryBanner className="mb-4" />}

      <h1 className="text-2xl font-bold mb-4">
        {isEditMode ? `Edit Order ${existingOrder?.orderNumber}` : 'Review Your Order'}
      </h1>

      {/* Draft toolbar - only show when not in edit mode */}
      {!isEditMode && <DraftToolbar className="mb-6" />}

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
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push((isPreOrder ? '/buyer/pre-order' : '/buyer/ats') + repQuery)}
                >
                  Continue Shopping
                </Button>
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
