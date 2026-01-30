'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { validateShipDates } from '@/lib/validation/ship-window'
import { updatePlannedShipmentDates } from '@/lib/data/actions/planned-shipments'
import { MoveItemModal } from './move-item-modal'
import type { PlannedShipmentDisplay, PlannedShipmentItem, ShipmentStatus } from '@/lib/types/planned-shipment'
import type { Currency } from '@/lib/types'

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  Planned: 'bg-blue-100 text-blue-800',
  PartiallyFulfilled: 'bg-yellow-100 text-yellow-800',
  Fulfilled: 'bg-green-100 text-green-800',
  Cancelled: 'bg-gray-100 text-gray-800',
}

interface PlannedShipmentCardProps {
  shipment: PlannedShipmentDisplay
  index: number
  currency: Currency
  editable: boolean
  allShipments: PlannedShipmentDisplay[]
  orderId: string
}

export function PlannedShipmentCard({
  shipment,
  index,
  currency,
  editable,
  allShipments,
  orderId,
}: PlannedShipmentCardProps) {
  const [startDate, setStartDate] = useState(shipment.plannedShipStart)
  const [endDate, setEndDate] = useState(shipment.plannedShipEnd)
  const [errors, setErrors] = useState<{ start?: string; end?: string }>({})
  const [isSaving, setIsSaving] = useState(false)
  const [moveItem, setMoveItem] = useState<PlannedShipmentItem | null>(null)

  // Only show Move button if editable and there are other shipments to move to
  const showMoveColumn = editable && allShipments.length > 1

  const displayName = shipment.collectionName ?? 'Available to Ship'
  const hasChanges =
    startDate !== shipment.plannedShipStart || endDate !== shipment.plannedShipEnd
  const hasErrors = !!errors.start || !!errors.end

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    const newStart = field === 'start' ? value : startDate
    const newEnd = field === 'end' ? value : endDate

    if (field === 'start') setStartDate(value)
    if (field === 'end') setEndDate(value)

    // Validate against collection window
    const collections =
      shipment.minAllowedStart || shipment.minAllowedEnd
        ? [
            {
              id: shipment.collectionId ?? 0,
              name: shipment.collectionName ?? 'Collection',
              shipWindowStart: shipment.minAllowedStart,
              shipWindowEnd: shipment.minAllowedEnd,
            },
          ]
        : []

    const result = validateShipDates(newStart, newEnd, collections)

    if (result.valid) {
      setErrors({})
    } else {
      const startError = result.errors.find((e) => e.field === 'start')
      const endError = result.errors.find((e) => e.field === 'end')
      setErrors({
        start: startError?.message,
        end: endError?.message,
      })
    }
  }

  const handleSave = async () => {
    if (hasErrors) {
      toast.error('Please fix validation errors first')
      return
    }

    setIsSaving(true)
    const result = await updatePlannedShipmentDates({
      shipmentId: shipment.id,
      plannedShipStart: startDate,
      plannedShipEnd: endDate,
    })

    if (result.success) {
      toast.success('Shipment dates updated')
    } else {
      toast.error(result.error || 'Failed to update dates')
    }
    setIsSaving(false)
  }

  const handleCancel = () => {
    setStartDate(shipment.plannedShipStart)
    setEndDate(shipment.plannedShipEnd)
    setErrors({})
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            Shipment {index + 1}: {displayName}
          </span>
          <Badge className={STATUS_COLORS[shipment.status]}>
            {shipment.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          {shipment.plannedShipStart} – {shipment.plannedShipEnd}
        </div>
      </div>

      {/* Date editors */}
      {editable && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor={`start-${shipment.id}`}>Ship Start</Label>
            <Input
              id={`start-${shipment.id}`}
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange('start', e.target.value)}
              min={shipment.minAllowedStart ?? undefined}
              disabled={isSaving}
              className={errors.start ? 'border-destructive' : ''}
            />
            {shipment.minAllowedStart && (
              <p className="text-xs text-muted-foreground">
                Min: {shipment.minAllowedStart}
              </p>
            )}
            {errors.start && (
              <p className="text-xs text-destructive">{errors.start}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`end-${shipment.id}`}>Ship End</Label>
            <Input
              id={`end-${shipment.id}`}
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange('end', e.target.value)}
              min={shipment.minAllowedEnd ?? undefined}
              disabled={isSaving}
              className={errors.end ? 'border-destructive' : ''}
            />
            {shipment.minAllowedEnd && (
              <p className="text-xs text-muted-foreground">
                Min: {shipment.minAllowedEnd}
              </p>
            )}
            {errors.end && (
              <p className="text-xs text-destructive">{errors.end}</p>
            )}
          </div>
        </div>
      )}

      {/* Save/Cancel buttons */}
      {editable && hasChanges && (
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || hasErrors}
            size="sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Dates'
            )}
          </Button>
          <Button
            onClick={handleCancel}
            variant="outline"
            size="sm"
            disabled={isSaving}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Items table */}
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">SKU</th>
              <th className="text-right p-2 font-medium">Ordered</th>
              <th className="text-right p-2 font-medium">Fulfilled</th>
              <th className="text-right p-2 font-medium">Remaining</th>
              <th className="text-right p-2 font-medium">Price</th>
              <th className="text-right p-2 font-medium">Total</th>
              {showMoveColumn && <th className="p-2 font-medium w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {shipment.items.map((item) => (
              <tr key={item.orderItemId} className="border-t">
                <td className="p-2 font-mono text-xs">{item.sku}</td>
                <td className="p-2 text-right">{item.quantity}</td>
                <td className="p-2 text-right">
                  {item.quantityFulfilled > 0 ? (
                    <span className="text-green-600 font-medium">{item.quantityFulfilled}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="p-2 text-right">
                  {item.quantityRemaining > 0 ? (
                    <span className="text-amber-600 font-medium">{item.quantityRemaining}</span>
                  ) : (
                    <span className="text-green-600 font-medium">Done</span>
                  )}
                </td>
                <td className="p-2 text-right">
                  {formatCurrency(item.price, currency)}
                </td>
                <td className="p-2 text-right">
                  {formatCurrency(item.lineTotal, currency)}
                </td>
                {showMoveColumn && (
                  <td className="p-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMoveItem(item)}
                      className="h-7 px-2"
                    >
                      <ArrowRight className="h-3 w-3 mr-1" />
                      Move
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr className="border-t">
              <td colSpan={showMoveColumn ? 6 : 5} className="p-2 text-right font-medium">
                Subtotal
              </td>
              <td className="p-2 text-right font-medium">
                {formatCurrency(shipment.subtotal, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Move Item Modal */}
      {moveItem && (
        <MoveItemModal
          open={!!moveItem}
          onClose={() => setMoveItem(null)}
          item={moveItem}
          sourceShipment={shipment}
          allShipments={allShipments}
          orderId={orderId}
        />
      )}
    </div>
  )
}
