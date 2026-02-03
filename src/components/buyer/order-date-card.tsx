'use client'

import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Currency } from '@/lib/types'

// Format date without year for constraint messages
function formatDateNoYear(isoDate: string): string {
  const dateOnly = isoDate.split('T')[0]
  const [, month, day] = dateOnly.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[month - 1]} ${day}`
}

// Validate dates against constraints
function validateDates(
  start: string,
  end: string,
  minStart: string | null,
  minEnd: string | null
): { start?: string; end?: string } {
  const errors: { start?: string; end?: string } = {}

  const minStartDate = minStart?.split('T')[0]
  const minEndDate = minEnd?.split('T')[0]

  if (minStartDate && start < minStartDate) {
    errors.start = `Cannot be prior to ${formatDateNoYear(minStart!)}`
  }

  if (minEndDate && end < minEndDate) {
    errors.end = `Cannot be prior to ${formatDateNoYear(minEnd!)}`
  }

  if (start && end && start > end) {
    errors.end = 'End date must be after start date'
  }

  return errors
}

export interface OrderDateItem {
  sku: string
  description?: string
  quantity: number
  price: number
}

export interface OrderDateData {
  id: string
  collectionId: number | null
  collectionName: string | null
  minAllowedStart: string | null  // Collection ship window constraint
  minAllowedEnd: string | null    // Collection ship window constraint
  shipStart: string               // Current value
  shipEnd: string                 // Current value
  items: OrderDateItem[]
}

interface OrderDateCardProps {
  order: OrderDateData
  index: number
  currency: Currency
  onDatesChange: (orderId: string, start: string, end: string) => void
  disabled?: boolean
  errors?: { start?: string; end?: string }
}

export function OrderDateCard({
  order,
  index,
  currency,
  onDatesChange,
  disabled = false,
  errors,
}: OrderDateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Derive validation errors from props (no state needed)
  const localErrors = useMemo(() => validateDates(
    order.shipStart,
    order.shipEnd,
    order.minAllowedStart,
    order.minAllowedEnd
  ), [order.shipStart, order.shipEnd, order.minAllowedStart, order.minAllowedEnd])

  const displayErrors = {
    start: localErrors.start || errors?.start,
    end: localErrors.end || errors?.end,
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const displayName = order.collectionName ?? 'Available to Ship'

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    const newStart = field === 'start' ? value : order.shipStart
    const newEnd = field === 'end' ? value : order.shipEnd
    onDatesChange(order.id, newStart, newEnd)
  }

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">
              Order {index + 1}: {displayName}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="px-2 py-1 h-auto w-auto text-xs">
              {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatCurrency(subtotal, currency)}
            </Badge>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-muted rounded"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse item list' : 'Expand item list'}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Expandable items list */}
        {isExpanded && (
          <div className="text-sm text-muted-foreground space-y-1 pb-2 border-b">
            {order.items.map((item) => (
              <div key={item.sku} className="flex justify-between">
                <span className="truncate max-w-[60%]">
                  {item.sku}{item.description && ` - ${item.description}`}
                </span>
                <span>{item.quantity} × {formatCurrency(item.price, currency)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Date pickers */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor={`ship-start-${order.id}`}>Ship Start</Label>
            <Input
              id={`ship-start-${order.id}`}
              type="date"
              value={order.shipStart}
              min={order.minAllowedStart?.split('T')[0]}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className={displayErrors.start ? 'border-destructive' : ''}
              disabled={disabled}
            />
            {displayErrors.start ? (
              <p className="text-xs text-destructive">{displayErrors.start}</p>
            ) : order.minAllowedStart ? (
              <p className="text-xs text-muted-foreground">
                Cannot be prior to {formatDateNoYear(order.minAllowedStart)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ship-end-${order.id}`}>Ship End</Label>
            <Input
              id={`ship-end-${order.id}`}
              type="date"
              value={order.shipEnd}
              min={order.minAllowedEnd?.split('T')[0]}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className={displayErrors.end ? 'border-destructive' : ''}
              disabled={disabled}
            />
            {displayErrors.end ? (
              <p className="text-xs text-destructive">{displayErrors.end}</p>
            ) : order.minAllowedEnd ? (
              <p className="text-xs text-muted-foreground">
                Cannot be prior to {formatDateNoYear(order.minAllowedEnd)}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
