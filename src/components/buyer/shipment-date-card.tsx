'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { validateShipDates } from '@/lib/validation/ship-window'
import type { CollectionWindow } from '@/lib/validation/ship-window'
import type { CartPlannedShipment } from '@/lib/types/planned-shipment'
import type { Currency } from '@/lib/types'

interface CartItem {
  sku: string
  description?: string
  quantity: number
  price: number
}

interface ShipmentDateCardProps {
  shipment: CartPlannedShipment
  index: number
  cartItems: CartItem[]
  currency: Currency
  onDatesChange: (start: string, end: string) => void
  /** External errors from parent validation (survives refresh) */
  externalErrors?: { start?: string; end?: string }
  disabled?: boolean
}

export function ShipmentDateCard({
  shipment,
  index,
  cartItems,
  currency,
  onDatesChange,
  externalErrors,
  disabled = false,
}: ShipmentDateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [localErrors, setLocalErrors] = useState<{ start?: string; end?: string }>({})

  // Merge local and external errors (external takes precedence for display after refresh)
  const displayErrors = {
    start: localErrors.start || externalErrors?.start,
    end: localErrors.end || externalErrors?.end,
  }

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  // Display name: use collection name or "Available to Ship" for ATS items
  const displayName = shipment.collectionName ?? 'Available to Ship'

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    const newStart = field === 'start' ? value : shipment.plannedShipStart
    const newEnd = field === 'end' ? value : shipment.plannedShipEnd

    // Build collection window for validation (only if collection has constraints)
    const collections: CollectionWindow[] =
      shipment.minAllowedStart || shipment.minAllowedEnd
        ? [
            {
              id: shipment.collectionId ?? 0,
              name: shipment.collectionName ?? 'Collection',
              shipWindowStart: shipment.minAllowedStart,
              shipWindowEnd: shipment.minAllowedEnd,
            },
          ]
        : [] // Empty = ATS, no validation

    // Validate
    const result = validateShipDates(newStart, newEnd, collections)

    if (result.valid) {
      setLocalErrors({})
    } else {
      const startError = result.errors.find((e) => e.field === 'start')
      const endError = result.errors.find((e) => e.field === 'end')
      setLocalErrors({
        start: startError?.message,
        end: endError?.message,
      })
    }

    // Always update - validation is advisory during input, enforced on submit
    onDatesChange(newStart, newEnd)
  }

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">
              Shipment {index + 1}: {displayName}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" size="sm" className="px-2 py-1 h-auto w-auto text-xs">
              {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatCurrency(subtotal, currency)}
            </Badge>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-muted rounded"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse item list' : 'Expand item list'}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Expandable items list */}
        {isExpanded && (
          <div className="text-sm text-muted-foreground space-y-1 pb-2 border-b">
            {cartItems.map((item) => (
              <div key={item.sku} className="flex justify-between">
                <span className="truncate max-w-[60%]">
                  {item.sku}
                  {item.description && ` - ${item.description}`}
                </span>
                <span>
                  {item.quantity} × {formatCurrency(item.price, currency)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Date pickers */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor={`ship-start-${shipment.id}`}>Ship Start</Label>
            <Input
              id={`ship-start-${shipment.id}`}
              type="date"
              value={shipment.plannedShipStart}
              min={shipment.minAllowedStart ?? undefined}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className={displayErrors.start ? 'border-destructive' : ''}
              disabled={disabled}
            />
            {shipment.minAllowedStart && (
              <p className="text-xs text-muted-foreground">
                Earliest: {shipment.minAllowedStart}
              </p>
            )}
            {displayErrors.start && (
              <p className="text-xs text-destructive">{displayErrors.start}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ship-end-${shipment.id}`}>Ship End</Label>
            <Input
              id={`ship-end-${shipment.id}`}
              type="date"
              value={shipment.plannedShipEnd}
              min={shipment.minAllowedEnd ?? undefined}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className={displayErrors.end ? 'border-destructive' : ''}
              disabled={disabled}
            />
            {shipment.minAllowedEnd && (
              <p className="text-xs text-muted-foreground">
                Earliest: {shipment.minAllowedEnd}
              </p>
            )}
            {displayErrors.end && (
              <p className="text-xs text-destructive">{displayErrors.end}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
