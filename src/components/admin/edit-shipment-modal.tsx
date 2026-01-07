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
import { updateShipment, addTrackingNumber } from '@/lib/data/actions/shipments'
import type { ShipmentRow, Carrier } from '@/lib/types/shipment'
import { CARRIERS } from '@/lib/types/shipment'
import { formatCurrency, cn } from '@/lib/utils'

interface EditShipmentModalProps {
  shipment: ShipmentRow | null
  currency: 'USD' | 'CAD'
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditShipmentModal({
  shipment,
  currency,
  open,
  onOpenChange,
}: EditShipmentModalProps) {
  const router = useRouter()

  const [isSaving, setIsSaving] = React.useState(false)
  const [shippingCost, setShippingCost] = React.useState('')
  const [shipDate, setShipDate] = React.useState('')
  const [notes, setNotes] = React.useState('')

  // New tracking
  const [showAddTracking, setShowAddTracking] = React.useState(false)
  const [newCarrier, setNewCarrier] = React.useState<Carrier>('UPS')
  const [newTrackingNumber, setNewTrackingNumber] = React.useState('')
  const [isAddingTracking, setIsAddingTracking] = React.useState(false)

  // Initialize form when shipment changes
  React.useEffect(() => {
    if (shipment) {
      setShippingCost(shipment.shippingCost.toString())
      setShipDate(shipment.shipDate?.slice(0, 10) || '')
      setNotes(shipment.internalNotes || '')
      setShowAddTracking(false)
      setNewCarrier('UPS')
      setNewTrackingNumber('')
    }
  }, [shipment])

  const handleSave = async () => {
    if (!shipment) return

    setIsSaving(true)
    try {
      const result = await updateShipment({
        shipmentId: shipment.id,
        shippingCost: parseFloat(shippingCost) || 0,
        shipDate: shipDate || undefined,
        notes: notes.trim() || undefined,
      })

      if (result.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        alert(result.error || 'Failed to update shipment')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddTracking = async () => {
    if (!shipment || !newTrackingNumber.trim()) return

    setIsAddingTracking(true)
    try {
      const result = await addTrackingNumber(shipment.id, {
        carrier: newCarrier,
        trackingNumber: newTrackingNumber.trim(),
      })

      if (result.success) {
        setShowAddTracking(false)
        setNewCarrier('UPS')
        setNewTrackingNumber('')
        router.refresh()
      } else {
        alert(result.error || 'Failed to add tracking number')
      }
    } finally {
      setIsAddingTracking(false)
    }
  }

  if (!shipment) return null

  const newShippingCostNum = parseFloat(shippingCost) || 0
  const newShippedTotal = shipment.shippedSubtotal + newShippingCostNum
  const costDelta = newShippingCostNum - shipment.shippingCost

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Shipment</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Summary */}
          <div className="rounded-lg border bg-muted/20 p-4">
            <h3 className="font-medium mb-3">Shipment Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items Subtotal</span>
                <span className="font-medium">
                  {formatCurrency(shipment.shippedSubtotal, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Shipping</span>
                <span className="font-medium">
                  {formatCurrency(shipment.shippingCost, currency)}
                </span>
              </div>
              {costDelta !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">New Total</span>
                  <span className={cn('font-medium', costDelta > 0 && 'text-warning')}>
                    {formatCurrency(newShippedTotal, currency)}
                    {costDelta !== 0 && (
                      <span className="ml-1 text-xs">
                        ({costDelta > 0 ? '+' : ''}{formatCurrency(costDelta, currency)})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Edit Fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-ship-date" className="text-sm font-medium">
                  Ship Date
                </label>
                <input
                  id="edit-ship-date"
                  type="date"
                  value={shipDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShipDate(e.target.value)}
                  className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label htmlFor="edit-shipping-cost" className="text-sm font-medium">
                  Shipping Cost
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <input
                    id="edit-shipping-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={shippingCost}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShippingCost(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background pl-7 pr-3 text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="edit-notes" className="text-sm font-medium">
                Internal Notes
              </label>
              <textarea
                id="edit-notes"
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm resize-none"
              />
            </div>
          </div>

          {/* Existing Tracking */}
          {shipment.tracking.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Tracking Numbers</div>
              <div className="flex flex-wrap gap-2">
                {shipment.tracking.map((t) => (
                  <div
                    key={t.id}
                    className="inline-flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs"
                  >
                    <span className="font-medium">{t.carrier}:</span>
                    <span>{t.trackingNumber}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Tracking */}
          {showAddTracking ? (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="text-sm font-medium">Add Tracking Number</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-carrier" className="text-xs text-muted-foreground">
                    Carrier
                  </label>
                  <select
                    id="new-carrier"
                    value={newCarrier}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setNewCarrier(e.target.value as Carrier)
                    }
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {CARRIERS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-tracking" className="text-xs text-muted-foreground">
                    Tracking Number
                  </label>
                  <input
                    id="new-tracking"
                    type="text"
                    value={newTrackingNumber}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewTrackingNumber(e.target.value)
                    }
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Enter tracking number"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddTracking}
                  disabled={isAddingTracking || !newTrackingNumber.trim()}
                >
                  {isAddingTracking ? 'Adding...' : 'Add'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowAddTracking(false)
                    setNewTrackingNumber('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddTracking(true)}
            >
              + Add Tracking Number
            </Button>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
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
