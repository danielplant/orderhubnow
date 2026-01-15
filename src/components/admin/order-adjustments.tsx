'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
  cancelOrderItem,
} from '@/lib/data/actions/shipments'
import { CANCEL_REASONS, type CancelReason, type LineItemStatus } from '@/lib/types/shipment'
import { formatCurrency, cn } from '@/lib/utils'
import { XCircle, Loader2 } from 'lucide-react'

interface OrderItem {
  id: string
  sku: string
  quantity: number
  price: number
  currency: 'USD' | 'CAD'
  shippedQuantity: number
  cancelledQuantity: number
  remainingQuantity: number
  status: LineItemStatus
  cancelledReason: CancelReason | null
  cancelledAt: string | null
  cancelledBy: string | null
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
  const [showAddItem, setShowAddItem] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<OrderItem | null>(null)
  const [cancellingItem, setCancellingItem] = React.useState<OrderItem | null>(null)
  const [isLocked] = React.useState(orderStatus === 'Invoiced' || orderStatus === 'Cancelled')

  // Calculate fulfillment summary
  const totalOrdered = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalShipped = items.reduce((sum, item) => sum + item.shippedQuantity, 0)
  const totalCancelled = items.reduce((sum, item) => sum + item.cancelledQuantity, 0)
  const totalOpen = items.reduce((sum, item) => sum + item.remainingQuantity, 0)
  const fulfillmentPct = totalOrdered > 0 ? Math.round((totalShipped / totalOrdered) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Fulfillment Summary */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                'h-full transition-all',
                fulfillmentPct === 100 ? 'bg-success' : fulfillmentPct >= 50 ? 'bg-warning' : 'bg-destructive'
              )}
              style={{ width: `${fulfillmentPct}%` }}
            />
          </div>
          <span className="font-medium">{fulfillmentPct}%</span>
        </div>
        <span className="text-muted-foreground">
          {totalShipped}/{totalOrdered} shipped
          {totalCancelled > 0 && <span className="text-destructive"> | {totalCancelled} cancelled</span>}
          {totalOpen > 0 && <span className="text-warning"> | {totalOpen} open</span>}
        </span>
      </div>

      {/* Items Table with Edit Controls */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-4">SKU</th>
              <th className="py-2 pr-4 text-center w-20">Status</th>
              <th className="py-2 pr-4 text-right">Ordered</th>
              <th className="py-2 pr-4 text-right">Shipped</th>
              <th className="py-2 pr-4 text-right">Cancelled</th>
              <th className="py-2 pr-4 text-right">Open</th>
              <th className="py-2 pr-4 text-right">Unit</th>
              <th className="py-2 pr-4 text-right">Total</th>
              {!isLocked && <th className="py-2 pr-4 text-right w-32">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const lineTotal = item.price * item.quantity
              const canRemove = item.shippedQuantity === 0 && item.cancelledQuantity === 0
              const canCancel = item.remainingQuantity > 0
              const isCancelled = item.status === 'Cancelled'
              
              return (
                <tr 
                  key={item.id} 
                  className={cn(
                    'border-b border-border',
                    isCancelled && 'bg-muted/30'
                  )}
                >
                  <td className={cn('py-2 pr-4 font-medium', isCancelled && 'line-through text-muted-foreground')}>
                    {item.sku}
                  </td>
                  <td className="py-2 pr-4 text-center">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className={cn('py-2 pr-4 text-right', isCancelled && 'text-muted-foreground')}>
                    {item.quantity}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <span className={cn(item.shippedQuantity > 0 && 'text-success font-medium')}>
                      {item.shippedQuantity}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {item.cancelledQuantity > 0 ? (
                      <span 
                        className="text-destructive font-medium cursor-help"
                        title={item.cancelledReason ? `${item.cancelledReason}${item.cancelledBy ? ` by ${item.cancelledBy}` : ''}` : undefined}
                      >
                        {item.cancelledQuantity}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {item.remainingQuantity > 0 ? (
                      <span className="text-warning font-medium">{item.remainingQuantity}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className={cn('py-2 pr-4 text-right', isCancelled && 'text-muted-foreground')}>
                    {formatCurrency(item.price, item.currency)}
                  </td>
                  <td className={cn('py-2 pr-4 text-right font-medium', isCancelled && 'text-muted-foreground line-through')}>
                    {formatCurrency(lineTotal, item.currency)}
                  </td>
                  {!isLocked && (
                    <td className="py-2 pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        {!isCancelled && (
                          <>
                            <button
                              onClick={() => setEditingItem(item)}
                              className="text-xs text-primary hover:underline"
                            >
                              Edit
                            </button>
                            {canCancel && (
                              <>
                                <span className="text-muted-foreground">|</span>
                                <button
                                  onClick={() => setCancellingItem(item)}
                                  className="text-xs text-destructive hover:underline"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {canRemove && (
                              <>
                                <span className="text-muted-foreground">|</span>
                                <RemoveItemButton itemId={item.id} sku={item.sku} />
                              </>
                            )}
                          </>
                        )}
                        {isCancelled && item.cancelledReason && (
                          <span className="text-xs text-muted-foreground italic">
                            {item.cancelledReason}
                          </span>
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

      {/* Cancel Item Modal */}
      <CancelItemModal
        open={!!cancellingItem}
        onOpenChange={(open) => !open && setCancellingItem(null)}
        item={cancellingItem}
        currency={currency}
      />
    </div>
  )
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: LineItemStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        status === 'Open' && 'bg-warning/10 text-warning',
        status === 'Shipped' && 'bg-success/10 text-success',
        status === 'Cancelled' && 'bg-destructive/10 text-destructive'
      )}
    >
      {status}
    </span>
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

// ============================================================================
// Cancel Item Modal
// ============================================================================

interface CancelItemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: OrderItem | null
  currency: 'USD' | 'CAD'
}

function CancelItemModal({ open, onOpenChange, item, currency }: CancelItemModalProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = React.useState(false)
  const [quantity, setQuantity] = React.useState('')
  const [reason, setReason] = React.useState<CancelReason>('Out of stock')

  // Initialize form when item changes
  React.useEffect(() => {
    if (item) {
      setQuantity(item.remainingQuantity.toString())
      setReason('Out of stock')
    }
  }, [item])

  const handleCancel = async () => {
    if (!item) return

    const qty = parseInt(quantity) || 0

    if (qty <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }

    if (qty > item.remainingQuantity) {
      toast.error(`Cannot cancel more than ${item.remainingQuantity} units`)
      return
    }

    setIsSaving(true)
    try {
      const result = await cancelOrderItem(item.id, qty, reason)

      if (result.success) {
        toast.success(`Cancelled ${qty} units of ${item.sku}`, {
          description: `Reason: ${reason}`,
        })
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error('Failed to cancel item', {
          description: result.error || 'An unexpected error occurred',
        })
      }
    } catch {
      toast.error('Failed to cancel item', {
        description: 'An unexpected error occurred',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!item) return null

  const qty = parseInt(quantity) || 0
  const cancelValue = qty * item.price

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Cancel Item: {item.sku}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item Info */}
          <div className="rounded-lg bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ordered</span>
              <span>{item.quantity} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipped</span>
              <span className="text-success">{item.shippedQuantity} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Already Cancelled</span>
              <span className="text-destructive">{item.cancelledQuantity} units</span>
            </div>
            <div className="flex justify-between border-t pt-1 mt-1">
              <span className="font-medium">Available to Cancel</span>
              <span className="font-medium text-warning">{item.remainingQuantity} units</span>
            </div>
          </div>

          {/* Quantity to Cancel */}
          <div>
            <label htmlFor="cancel-quantity" className="text-sm font-medium">
              Quantity to Cancel
            </label>
            <input
              id="cancel-quantity"
              type="number"
              min="1"
              max={item.remainingQuantity}
              value={quantity}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuantity(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Max: {item.remainingQuantity} units
            </p>
          </div>

          {/* Reason Selector */}
          <div>
            <label htmlFor="cancel-reason" className="text-sm font-medium">
              Reason for Cancellation
            </label>
            <select
              id="cancel-reason"
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReason(e.target.value as CancelReason)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Cancel Value */}
          {cancelValue > 0 && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-destructive">Value to Cancel</span>
                <span className="font-medium text-destructive">
                  -{formatCurrency(cancelValue, currency)}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Back
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancel} 
              disabled={isSaving || qty <= 0 || qty > item.remainingQuantity}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                `Cancel ${qty} Units`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
