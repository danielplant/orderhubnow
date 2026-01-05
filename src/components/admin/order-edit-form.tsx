'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateOrderShipping, adjustOrderItems } from '@/lib/data/actions/orders'
import { formatCurrency } from '@/lib/utils'

interface OrderItem {
  id: string
  sku: string
  quantity: number
  shippedQuantity: number | null
  price: number
  currency: 'USD' | 'CAD'
}

interface OrderEditFormProps {
  orderId: string
  currency: 'USD' | 'CAD'
  orderAmount: number
  shippingCost: number | null
  trackingNumber: string | null
  shipDate: string | null
  invoiceNumber: string | null
  items: OrderItem[]
}

export function OrderEditForm({
  orderId,
  currency,
  orderAmount,
  shippingCost: initialShippingCost,
  trackingNumber: initialTrackingNumber,
  shipDate: initialShipDate,
  invoiceNumber: initialInvoiceNumber,
  items: initialItems,
}: OrderEditFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // Form state
  const [shippingCost, setShippingCost] = React.useState(initialShippingCost ?? 0)
  const [trackingNumber, setTrackingNumber] = React.useState(initialTrackingNumber ?? '')
  const [shipDate, setShipDate] = React.useState(initialShipDate ?? '')
  const [invoiceNumber, setInvoiceNumber] = React.useState(initialInvoiceNumber ?? '')

  // Item adjustments
  const [itemAdjustments, setItemAdjustments] = React.useState<Record<string, number>>(
    Object.fromEntries(
      initialItems.map((item) => [item.id, item.shippedQuantity ?? item.quantity])
    )
  )

  // Calculate current shipped total
  const calculatedShippedAmount = React.useMemo(() => {
    return initialItems.reduce((sum, item) => {
      const shippedQty = itemAdjustments[item.id] ?? item.quantity
      return sum + shippedQty * item.price
    }, 0)
  }, [initialItems, itemAdjustments])

  const handleShippingSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    const result = await updateOrderShipping({
      orderId,
      shippingCost,
      trackingNumber,
      shipDate: shipDate || undefined,
      invoiceNumber,
    })

    if (result.success) {
      setSuccess('Shipping info updated')
      router.refresh()
    } else {
      setError(result.error || 'Failed to update')
    }

    setIsLoading(false)
  }

  const handleItemsSubmit = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    const items = Object.entries(itemAdjustments).map(([id, shippedQuantity]) => ({
      id,
      shippedQuantity,
    }))

    const result = await adjustOrderItems({ orderId, items })

    if (result.success) {
      setSuccess(`Shipped amount updated to ${formatCurrency(result.shippedAmount || 0, currency)}`)
      router.refresh()
    } else {
      setError(result.error || 'Failed to adjust items')
    }

    setIsLoading(false)
  }

  const handleItemQuantityChange = (itemId: string, value: string) => {
    const qty = parseInt(value, 10)
    if (!Number.isNaN(qty) && qty >= 0) {
      setItemAdjustments((prev) => ({ ...prev, [itemId]: qty }))
    }
  }

  const difference = orderAmount - calculatedShippedAmount

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-success/10 border border-success/20 p-3 text-sm text-success">
          {success}
        </div>
      )}

      {/* Shipping Info Form */}
      <Card>
        <CardHeader>
          <CardTitle>Shipping & Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleShippingSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shippingCost">Shipping Cost ({currency})</Label>
                <Input
                  id="shippingCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trackingNumber">Tracking Number</Label>
                <Input
                  id="trackingNumber"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Enter tracking number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shipDate">Ship Date</Label>
                <Input
                  id="shipDate"
                  type="date"
                  value={shipDate}
                  onChange={(e) => setShipDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input
                  id="invoiceNumber"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Enter invoice number"
                />
              </div>
            </div>

            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Shipping Info'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Item Adjustments */}
      <Card>
        <CardHeader>
          <CardTitle>Adjust Shipped Quantities</CardTitle>
          <p className="text-sm text-muted-foreground">
            Adjust quantities if shipment differs from order (e.g., warehouse was short an item)
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4 text-right">Ordered</th>
                  <th className="py-2 pr-4 text-right">Shipped</th>
                  <th className="py-2 pr-4 text-right">Unit Price</th>
                  <th className="py-2 pr-4 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {initialItems.map((item) => {
                  const shippedQty = itemAdjustments[item.id] ?? item.quantity
                  const lineTotal = shippedQty * item.price
                  const qtyDiff = item.quantity - shippedQty

                  return (
                    <tr key={item.id} className="border-b border-border">
                      <td className="py-2 pr-4 font-medium">{item.sku}</td>
                      <td className="py-2 pr-4 text-right">{item.quantity}</td>
                      <td className="py-2 pr-4 text-right">
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity * 2}
                          className="w-20 h-8 text-right"
                          value={shippedQty}
                          onChange={(e) => handleItemQuantityChange(item.id, e.target.value)}
                        />
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {formatCurrency(item.price, currency)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <span className="font-medium">{formatCurrency(lineTotal, currency)}</span>
                        {qtyDiff !== 0 && (
                          <span className={`ml-2 text-xs ${qtyDiff > 0 ? 'text-destructive' : 'text-success'}`}>
                            ({qtyDiff > 0 ? '-' : '+'}{Math.abs(qtyDiff)})
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td colSpan={3} className="py-3 pr-4 text-muted-foreground">
                    Original Order Total
                  </td>
                  <td className="py-3 pr-4 text-right" />
                  <td className="py-3 pr-4 text-right font-medium">
                    {formatCurrency(orderAmount, currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-1 pr-4 text-muted-foreground">
                    Calculated Shipped Total
                  </td>
                  <td className="py-1 pr-4 text-right" />
                  <td className="py-1 pr-4 text-right font-semibold">
                    {formatCurrency(calculatedShippedAmount, currency)}
                  </td>
                </tr>
                {Math.abs(difference) > 0.01 && (
                  <tr>
                    <td colSpan={3} className="py-1 pr-4 text-muted-foreground">
                      Difference
                    </td>
                    <td className="py-1 pr-4 text-right" />
                    <td className={`py-1 pr-4 text-right font-medium ${difference > 0 ? 'text-destructive' : 'text-success'}`}>
                      {difference > 0 ? '-' : '+'}
                      {formatCurrency(Math.abs(difference), currency)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={handleItemsSubmit} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Item Adjustments'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                // Reset to ordered quantities
                setItemAdjustments(
                  Object.fromEntries(initialItems.map((item) => [item.id, item.quantity]))
                )
              }}
            >
              Reset to Ordered
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
