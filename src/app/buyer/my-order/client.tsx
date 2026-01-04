'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useOrder } from '@/lib/contexts/order-context'
import { useCurrency } from '@/lib/contexts/currency-context'
import { OrderForm } from '@/components/buyer/order-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Trash2 } from 'lucide-react'

interface SkuData {
  skuVariantId: number
  priceCAD: number
  priceUSD: number
  description: string
}

interface MyOrderClientProps {
  reps: Array<{ id: string; name: string }>
  skuMap: Record<string, SkuData>
}

export function MyOrderClient({ reps, skuMap }: MyOrderClientProps) {
  const router = useRouter()
  const { orders, totalItems, removeItem } = useOrder()
  const { currency } = useCurrency()

  // Redirect to collections if cart is empty
  useEffect(() => {
    if (totalItems === 0) {
      router.replace('/buyer/select-journey')
    }
  }, [totalItems, router])

  // Transform cart state to flat cart items array with SKU data
  const cartItems = useMemo(() => {
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
  }, [orders, skuMap, currency])

  // Calculate totals
  const orderTotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  // Don't render form until we've checked cart
  if (totalItems === 0) {
    return null
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Review Your Order</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Order Summary - Right side on desktop */}
        <div className="lg:col-span-1 lg:order-2">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {totalItems} item{totalItems !== 1 ? 's' : ''} in cart
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
                        {item.quantity} x {formatCurrency(item.price, currency)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {formatCurrency(item.price * item.quantity, currency)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeItem(item.productId, item.sku)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total ({currency})</span>
                  <span>{formatCurrency(orderTotal, currency)}</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push('/buyer/ats')}
              >
                Continue Shopping
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Customer Form - Left side on desktop */}
        <div className="lg:col-span-2 lg:order-1">
          <OrderForm currency={currency} reps={reps} cartItems={cartItems} />
        </div>
      </div>
    </div>
  )
}
