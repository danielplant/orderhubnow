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
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
} from '@/lib/data/actions/shipments'
import { formatCurrency, cn } from '@/lib/utils'

interface OrderItem {
  id: string
  sku: string
  quantity: number
  price: number
  currency: 'USD' | 'CAD'
  shippedQuantity: number
}

interface OrderAdjustmentsProps {
  orderId: string
  orderNumber: string
  orderStatus: string
  items: OrderItem[]
  currency: 'USD' | 'CAD'
}

export function OrderAdjustments({
  orderId,
  orderNumber,
  orderStatus,
  items,
  currency,
}: OrderAdjustmentsProps) {
  const router = useRouter()
  const [showAddItem, setShowAddItem] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<OrderItem | null>(null)
  const [isLocked] = React.useState(orderStatus === 'Invoiced' || orderStatus === 'Cancelled')

  return (
    <div className="space-y-3">
      {/* Items Table with Edit Controls */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-4">SKU</th>
              <th className="py-2 pr-4 text-right">Qty</th>
              <th className="py-2 pr-4 text-right">Shipped</th>
              <th className="py-2 pr-4 text-right">Unit</th>
              <th className="py-2 pr-4 text-right">Total</th>
              {!isLocked && <th className="py-2 pr-4 text-right w-24">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const lineTotal = item.price * item.quantity
              const canRemove = item.shippedQuantity === 0
              return (
                <tr key={item.id} className="border-b border-border">
                  <td className="py-2 pr-4 font-medium">{item.sku}</td>
                  <td className="py-2 pr-4 text-right">{item.quantity}</td>
                  <td className="py-2 pr-4 text-right">
                    <span
                      className={cn(
                        item.shippedQuantity > 0 && 'text-success font-medium'
                      )}
                    >
                      {item.shippedQuantity}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatCurrency(item.price, item.currency)}
                  </td>
                  <td className="py-2 pr-4 text-right font-medium">
                    {formatCurrency(lineTotal, item.currency)}
                  </td>
                  {!isLocked && (
                    <td className="py-2 pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="text-xs text-primary hover:underline"
                        >
                          Edit
                        </button>
                        {canRemove && (
                          <>
                            <span className="text-muted-foreground">|</span>
                            <RemoveItemButton itemId={item.id} sku={item.sku} />
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add Item Button */}
      {!isLocked && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddItem(true)}
        >
          + Add Item
        </Button>
      )}

      {/* Add Item Modal */}
      <AddItemModal
        open={showAddItem}
        onOpenChange={setShowAddItem}
        orderId={orderId}
        orderNumber={orderNumber}
        currency={currency}
      />

      {/* Edit Item Modal */}
      <EditItemModal
        open={!!editingItem}
        onOpenChange={(open) => !open && setEditingItem(null)}
        item={editingItem}
        currency={currency}
      />
    </div>
  )
}

// ============================================================================
// Remove Item Button
// ============================================================================

function RemoveItemButton({ itemId, sku }: { itemId: string; sku: string }) {
  const router = useRouter()
  const [isRemoving, setIsRemoving] = React.useState(false)

  const handleRemove = async () => {
    if (!confirm(`Remove ${sku} from this order?`)) return

    setIsRemoving(true)
    try {
      const result = await removeOrderItem(itemId)
      if (result.success) {
        router.refresh()
      } else {
        alert(result.error || 'Failed to remove item')
      }
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isRemoving}
      className="text-xs text-destructive hover:underline disabled:opacity-50"
    >
      {isRemoving ? '...' : 'Remove'}
    </button>
  )
}

// ============================================================================
// Add Item Modal
// ============================================================================

interface AddItemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  orderNumber: string
  currency: 'USD' | 'CAD'
}

function AddItemModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  currency,
}: AddItemModalProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = React.useState(false)
  const [sku, setSku] = React.useState('')
  const [quantity, setQuantity] = React.useState('1')
  const [price, setPrice] = React.useState('')
  const [notes, setNotes] = React.useState('')

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setSku('')
      setQuantity('1')
      setPrice('')
      setNotes('')
    }
  }, [open])

  const handleAdd = async () => {
    if (!sku.trim()) {
      alert('Please enter a SKU')
      return
    }

    const qty = parseInt(quantity) || 0
    const unitPrice = parseFloat(price) || 0

    if (qty <= 0) {
      alert('Quantity must be greater than 0')
      return
    }

    if (unitPrice <= 0) {
      alert('Price must be greater than 0')
      return
    }

    setIsSaving(true)
    try {
      const result = await addOrderItem({
        orderId,
        sku: sku.trim().toUpperCase(),
        quantity: qty,
        price: unitPrice,
        notes: notes.trim() || undefined,
      })

      if (result.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        alert(result.error || 'Failed to add item')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const qty = parseInt(quantity) || 0
  const unitPrice = parseFloat(price) || 0
  const lineTotal = qty * unitPrice

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Item to Order {orderNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="add-sku" className="text-sm font-medium">
              SKU
            </label>
            <input
              id="add-sku"
              type="text"
              value={sku}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSku(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm uppercase"
              placeholder="Enter SKU"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="add-quantity" className="text-sm font-medium">
                Quantity
              </label>
              <input
                id="add-quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuantity(e.target.value)}
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="add-price" className="text-sm font-medium">
                Unit Price ({currency})
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <input
                  id="add-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background pl-7 pr-3 text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="add-notes" className="text-sm font-medium">
              Notes (optional)
            </label>
            <input
              id="add-notes"
              type="text"
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              placeholder="Reason for adding item"
            />
          </div>

          {lineTotal > 0 && (
            <div className="rounded-lg bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Line Total</span>
                <span className="font-medium">{formatCurrency(lineTotal, currency)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={isSaving || !sku.trim()}>
              {isSaving ? 'Adding...' : 'Add Item'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Edit Item Modal
// ============================================================================

interface EditItemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: OrderItem | null
  currency: 'USD' | 'CAD'
}

function EditItemModal({ open, onOpenChange, item, currency }: EditItemModalProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = React.useState(false)
  const [quantity, setQuantity] = React.useState('')
  const [price, setPrice] = React.useState('')

  // Initialize form when item changes
  React.useEffect(() => {
    if (item) {
      setQuantity(item.quantity.toString())
      setPrice(item.price.toString())
    }
  }, [item])

  const handleSave = async () => {
    if (!item) return

    const qty = parseInt(quantity) || 0
    const unitPrice = parseFloat(price) || 0

    if (qty < item.shippedQuantity) {
      alert(`Quantity cannot be less than shipped quantity (${item.shippedQuantity})`)
      return
    }

    if (unitPrice <= 0) {
      alert('Price must be greater than 0')
      return
    }

    setIsSaving(true)
    try {
      const result = await updateOrderItem({
        itemId: item.id,
        quantity: qty,
        price: unitPrice,
      })

      if (result.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        alert(result.error || 'Failed to update item')
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (!item) return null

  const qty = parseInt(quantity) || 0
  const unitPrice = parseFloat(price) || 0
  const lineTotal = qty * unitPrice
  const originalTotal = item.quantity * item.price
  const delta = lineTotal - originalTotal

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Item: {item.sku}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {item.shippedQuantity > 0 && (
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm">
              <span className="text-warning font-medium">
                {item.shippedQuantity} units already shipped
              </span>
              <p className="text-muted-foreground text-xs mt-1">
                Quantity cannot be reduced below shipped amount
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-quantity" className="text-sm font-medium">
                Quantity
              </label>
              <input
                id="edit-quantity"
                type="number"
                min={item.shippedQuantity}
                value={quantity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuantity(e.target.value)}
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Original: {item.quantity}
              </p>
            </div>
            <div>
              <label htmlFor="edit-price" className="text-sm font-medium">
                Unit Price ({currency})
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <input
                  id="edit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background pl-7 pr-3 text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Original: {formatCurrency(item.price, currency)}
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/30 p-3 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original Total</span>
              <span>{formatCurrency(originalTotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">New Total</span>
              <span className="font-medium">{formatCurrency(lineTotal, currency)}</span>
            </div>
            {delta !== 0 && (
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Change</span>
                <span
                  className={cn(
                    'font-medium',
                    delta > 0 && 'text-success',
                    delta < 0 && 'text-destructive'
                  )}
                >
                  {delta > 0 ? '+' : ''}
                  {formatCurrency(delta, currency)}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
