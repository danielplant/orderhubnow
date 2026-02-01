'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { validateShipDates } from '@/lib/validation/ship-window'
import { moveItemBetweenShipments } from '@/lib/data/actions/planned-shipments'
import type { PlannedShipmentItem, PlannedShipmentDisplay } from '@/lib/types/planned-shipment'

interface MoveItemModalProps {
  open: boolean
  onClose: () => void
  item: PlannedShipmentItem
  sourceShipment: PlannedShipmentDisplay
  allShipments: PlannedShipmentDisplay[]
  orderId: string
}

export function MoveItemModal({
  open,
  onClose,
  item,
  sourceShipment,
  allShipments,
  orderId: _orderId,
}: MoveItemModalProps) {
  const [targetShipmentId, setTargetShipmentId] = useState<string>('')
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)
  const [isMoving, setIsMoving] = useState(false)

  // Get target shipments (exclude source)
  const targetShipments = useMemo(
    () => allShipments.filter((s) => s.id !== sourceShipment.id),
    [allShipments, sourceShipment.id]
  )

  // Get selected target shipment
  const targetShipment = useMemo(
    () => targetShipments.find((s) => s.id === targetShipmentId),
    [targetShipments, targetShipmentId]
  )

  // Validate target dates against item's collection window (not source shipment's)
  const validationResult = useMemo(() => {
    if (!targetShipment) return null

    // Use the ITEM's collection window (from SKU lookup), not the source shipment's
    const collectionWindow = {
      id: item.collectionId ?? 0,
      name: item.collectionName ?? 'Collection',
      shipWindowStart: item.minAllowedStart,
      shipWindowEnd: item.minAllowedEnd,
    }

    // Skip validation if no collection window (ATS items)
    if (!collectionWindow.shipWindowStart && !collectionWindow.shipWindowEnd) {
      return { valid: true, errors: [], warnings: [] }
    }

    return validateShipDates(
      targetShipment.plannedShipStart,
      targetShipment.plannedShipEnd,
      [collectionWindow]
    )
  }, [targetShipment, item])

  const hasValidationWarning = validationResult && !validationResult.valid
  const canMove = targetShipmentId && (!hasValidationWarning || overrideConfirmed)

  const handleMove = async () => {
    if (!targetShipmentId) return

    setIsMoving(true)
    const result = await moveItemBetweenShipments({
      orderItemId: item.orderItemId,
      fromShipmentId: sourceShipment.id,
      toShipmentId: targetShipmentId,
      allowOverride: overrideConfirmed,
    })

    if (result.success) {
      toast.success(`Moved ${item.sku} to ${targetShipment?.collectionName ?? 'target shipment'}`)
      handleClose()
    } else if (result.warning) {
      // Server returned a warning - should show override option
      toast.error(result.warning)
    } else {
      toast.error(result.error || 'Failed to move item')
    }
    setIsMoving(false)
  }

  const handleClose = () => {
    setTargetShipmentId('')
    setOverrideConfirmed(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Move Item
          </DialogTitle>
          <DialogDescription>
            Move this item to a different planned shipment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item info */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-medium">{item.sku}</span>
              <span className="text-sm text-muted-foreground">
                {item.quantity} units
              </span>
            </div>
            {item.description && (
              <p className="text-sm text-muted-foreground">{item.description}</p>
            )}
            {item.quantityFulfilled > 0 && (
              <Badge className="text-amber-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {item.quantityFulfilled} units already fulfilled
              </Badge>
            )}
          </div>

          {/* Source shipment */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">From</Label>
            <div className="text-sm">
              {sourceShipment.collectionName ?? 'Available to Ship'} ({sourceShipment.plannedShipStart} – {sourceShipment.plannedShipEnd})
            </div>
          </div>

          {/* Target shipment selector */}
          <div className="space-y-2">
            <Label htmlFor="target-shipment">Move to</Label>
            <Select value={targetShipmentId} onValueChange={setTargetShipmentId}>
              <SelectTrigger id="target-shipment" className="w-full">
                <SelectValue placeholder="Select target shipment" />
              </SelectTrigger>
              <SelectContent>
                {targetShipments.map((shipment) => (
                  <SelectItem key={shipment.id} value={shipment.id}>
                    {shipment.collectionName ?? 'Available to Ship'} ({shipment.plannedShipStart} – {shipment.plannedShipEnd})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Validation warning */}
          {hasValidationWarning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Date Conflict</p>
                  <p className="mt-1">
                    {validationResult?.errors[0]?.message || 'Target shipment dates are before this item\'s collection window.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="override-confirm"
                  checked={overrideConfirmed}
                  onCheckedChange={(checked) => setOverrideConfirmed(checked === true)}
                />
                <Label htmlFor="override-confirm" className="text-sm text-amber-800 cursor-pointer">
                  I understand and want to proceed anyway
                </Label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isMoving}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={!canMove || isMoving}>
            {isMoving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Moving...
              </>
            ) : (
              'Move Item'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
