'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'
import {
  createShipment,
  getOrderItemsWithFulfillment,
} from '@/lib/data/actions/shipments'
import type {
  CreateShipmentInput,
  ShipmentItemInput,
  Carrier,
  OrderItemWithFulfillment,
} from '@/lib/types/shipment'
import { CARRIERS } from '@/lib/types/shipment'
import { formatCurrency, cn } from '@/lib/utils'

interface ShipmentModalProps {
  orderId: string | null
  orderNumber: string | null
  orderAmount: number
  currency: 'USD' | 'CAD'
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ItemSelection {
  selected: boolean
  quantity: number
  priceOverride?: number
}

export function ShipmentModal({
  orderId,
  orderNumber,
  orderAmount,
  currency,
  open,
  onOpenChange,
}: ShipmentModalProps) {
  const router = useRouter()

  // Loading states
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  // Order items
  const [orderItems, setOrderItems] = React.useState<OrderItemWithFulfillment[]>([])
  const [selections, setSelections] = React.useState<Map<string, ItemSelection>>(new Map())

  // Shipment details
  const [shippingCost, setShippingCost] = React.useState('')
  const [carrier, setCarrier] = React.useState<Carrier>('UPS')
  const [trackingNumber, setTrackingNumber] = React.useState('')
  const [shipDate, setShipDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = React.useState('')

  // Load order items when modal opens
  React.useEffect(() => {
    if (open && orderId) {
      setIsLoading(true)
      getOrderItemsWithFulfillment(orderId)
        .then((items) => {
          setOrderItems(items)
          // Initialize selections - pre-select items with remaining quantity
          const newSelections = new Map<string, ItemSelection>()
          for (const item of items) {
            newSelections.set(item.id, {
              selected: item.remainingQuantity > 0,
              quantity: item.remainingQuantity,
            })
          }
          setSelections(newSelections)
        })
        .finally(() => setIsLoading(false))
    } else {
      // Reset state when modal closes
      setOrderItems([])
      setSelections(new Map())
      setShippingCost('')
      setCarrier('UPS')
      setTrackingNumber('')
      setShipDate(new Date().toISOString().slice(0, 10))
      setNotes('')
    }
  }, [open, orderId])

  // Toggle item selection
  const toggleItem = (itemId: string) => {
    setSelections((prev) => {
      const current = prev.get(itemId)
      if (!current) return prev
      const next = new Map(prev)
      next.set(itemId, { ...current, selected: !current.selected })
      return next
    })
  }

  // Update item quantity
  const updateQuantity = (itemId: string, qty: number) => {
    setSelections((prev) => {
      const current = prev.get(itemId)
      if (!current) return prev
      const item = orderItems.find((i) => i.id === itemId)
      const maxQty = item?.remainingQuantity ?? 0
      const next = new Map(prev)
      next.set(itemId, {
        ...current,
        quantity: Math.max(0, Math.min(qty, maxQty)),
        selected: qty > 0, // Auto-select if qty > 0
      })
      return next
    })
  }

  // Calculate totals
  const selectedItems = orderItems.filter((item) => {
    const sel = selections.get(item.id)
    return sel?.selected && sel.quantity > 0
  })

  const shippedSubtotal = selectedItems.reduce((sum, item) => {
    const sel = selections.get(item.id)!
    const price = sel.priceOverride ?? item.unitPrice
    return sum + price * sel.quantity
  }, 0)

  const shippingCostNum = parseFloat(shippingCost) || 0
  const shippedTotal = shippedSubtotal + shippingCostNum
  const variance = shippedTotal - orderAmount

  // Handle create shipment
  const handleCreate = async () => {
    if (!orderId || selectedItems.length === 0) return

    setIsSaving(true)
    try {
      const items: ShipmentItemInput[] = selectedItems.map((item) => {
        const sel = selections.get(item.id)!
        return {
          orderItemId: item.id,
          quantityShipped: sel.quantity,
          priceOverride: sel.priceOverride,
        }
      })

      const input: CreateShipmentInput = {
        orderId,
        items,
        shippingCost: shippingCostNum,
        shipDate,
        notes: notes.trim() || undefined,
      }

      // Add tracking if provided
      if (trackingNumber.trim()) {
        input.tracking = {
          carrier,
          trackingNumber: trackingNumber.trim(),
        }
      }

      const result = await createShipment(input)

      if (result.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        alert(result.error || 'Failed to create shipment')
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (!orderId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shipment for Order {orderNumber}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading order items...</p>
        ) : (
          <div className="space-y-6">
            {/* Line Items */}
            <div>
              <div className="text-sm font-medium mb-2">Line Items</div>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-10 p-2"></th>
                      <th className="text-left p-2">SKU</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-center p-2">Ordered</th>
                      <th className="text-center p-2">Shipped</th>
                      <th className="text-center p-2">Remaining</th>
                      <th className="text-center p-2">Ship Qty</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-right p-2">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orderItems.map((item) => {
                      const sel = selections.get(item.id)
                      const isSelected = sel?.selected ?? false
                      const qty = sel?.quantity ?? 0
                      const lineTotal = (sel?.priceOverride ?? item.unitPrice) * qty
                      const hasRemaining = item.remainingQuantity > 0

                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            'transition-colors',
                            !hasRemaining && 'bg-muted/30 text-muted-foreground'
                          )}
                        >
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!hasRemaining}
                              onChange={() => toggleItem(item.id)}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                          <td className="p-2 font-mono text-xs">{item.sku}</td>
                          <td className="p-2 truncate max-w-[150px]" title={item.productName}>
                            {item.productName}
                          </td>
                          <td className="p-2 text-center">{item.orderedQuantity}</td>
                          <td className="p-2 text-center">{item.shippedQuantity}</td>
                          <td className="p-2 text-center">
                            <span
                              className={cn(
                                item.remainingQuantity === 0
                                  ? 'text-success'
                                  : 'text-warning font-medium'
                              )}
                            >
                              {item.remainingQuantity}
                            </span>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={item.remainingQuantity}
                              value={qty}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                              disabled={!hasRemaining}
                              className="w-16 h-8 text-center rounded border border-input bg-background text-sm"
                            />
                          </td>
                          <td className="p-2 text-right">
                            {formatCurrency(item.unitPrice, currency)}
                          </td>
                          <td className="p-2 text-right font-medium">
                            {isSelected && qty > 0
                              ? formatCurrency(lineTotal, currency)
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {orderItems.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No items found for this order.
                  </p>
                )}
              </div>
            </div>

            {/* Shipping Details + Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Shipping Details */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ship-date" className="text-sm font-medium">Ship Date</label>
                    <input
                      id="ship-date"
                      type="date"
                      value={shipDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShipDate(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="shipping-cost" className="text-sm font-medium">Shipping Cost</label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <input
                        id="shipping-cost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={shippingCost}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShippingCost(e.target.value)}
                        className="w-full h-10 rounded-md border border-input bg-background pl-7 pr-3 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="carrier" className="text-sm font-medium">Carrier</label>
                    <select
                      id="carrier"
                      value={carrier}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCarrier(e.target.value as Carrier)}
                      className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {CARRIERS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="tracking" className="text-sm font-medium">Tracking Number</label>
                    <input
                      id="tracking"
                      type="text"
                      value={trackingNumber}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTrackingNumber(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="notes" className="text-sm font-medium">Internal Notes</label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm resize-none"
                    placeholder="Optional notes about this shipment..."
                  />
                </div>
              </div>

              {/* Right: Totals Card */}
              <div className="rounded-lg border bg-muted/20 p-4">
                <h3 className="font-medium mb-4">Shipment Summary</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items Subtotal</span>
                    <span className="font-medium">
                      {formatCurrency(shippedSubtotal, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="font-medium">
                      {shippingCostNum > 0
                        ? formatCurrency(shippingCostNum, currency)
                        : '—'}
                    </span>
                  </div>
                  <div className="border-t pt-3 flex justify-between">
                    <span className="font-medium">Shipped Total</span>
                    <span className="font-bold text-base">
                      {formatCurrency(shippedTotal, currency)}
                    </span>
                  </div>

                  <div className="border-t pt-3 mt-4 space-y-2">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Original Order</span>
                      <span>{formatCurrency(orderAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Variance</span>
                      <span
                        className={cn(
                          'font-medium',
                          variance < 0 && 'text-destructive',
                          variance > 0 && 'text-success',
                          variance === 0 && 'text-muted-foreground'
                        )}
                      >
                        {variance >= 0 ? '+' : ''}
                        {formatCurrency(variance, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isSaving || selectedItems.length === 0}
              >
                {isSaving ? 'Creating...' : 'Create Shipment'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
