'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Package, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShipmentItem {
  sku: string
  description?: string
  quantity: number
}

interface ShipmentInfo {
  id: string
  collectionName: string | null
  plannedShipStart: string
  plannedShipEnd: string
  status?: string
  itemCount?: number
  items?: ShipmentItem[]  // Optional: actual items for expanded view
}

interface ShipmentTimelineProps {
  shipments: ShipmentInfo[]
  variant?: 'compact' | 'full'
  showStatus?: boolean
  className?: string
}

/**
 * Format ISO date string to display format (e.g., "Jul 15")
 */
function formatShortDate(isoDate: string): string {
  if (!isoDate) return 'TBD'
  const date = new Date(isoDate)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Get status color for timeline node
 */
function getStatusColor(status?: string): string {
  switch (status) {
    case 'Fulfilled':
      return 'bg-green-500'
    case 'PartiallyFulfilled':
      return 'bg-amber-500'
    case 'Cancelled':
      return 'bg-red-500'
    case 'Planned':
    default:
      return 'bg-blue-500'
  }
}

/**
 * ShipmentTimeline - Displays shipment schedule in compact or full format
 * 
 * Compact: "Jul 15 | 3 shipments" - for use in tables
 * Full: Visual timeline with expandable nodes - for detail pages
 */
export function ShipmentTimeline({
  shipments,
  variant = 'compact',
  showStatus = false,
  className,
}: ShipmentTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (shipments.length === 0) {
    return null
  }

  // Sort shipments by start date
  const sortedShipments = [...shipments].sort((a, b) =>
    a.plannedShipStart.localeCompare(b.plannedShipStart)
  )

  const firstShipment = sortedShipments[0]
  const shipmentCount = shipments.length

  // Compact variant: simple inline display
  if (variant === 'compact') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
        <Calendar className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{formatShortDate(firstShipment.plannedShipStart)}</span>
        {shipmentCount > 1 && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">{shipmentCount} shipments</span>
          </>
        )}
      </span>
    )
  }

  // Full variant: visual timeline with expandable nodes
  return (
    <div className={cn('space-y-2', className)}>
      {/* Header summary */}
      <div className="flex items-center gap-2 text-sm">
        <Package className="h-4 w-4 text-primary" />
        <span className="font-medium">
          First shipment: {formatShortDate(firstShipment.plannedShipStart)}
        </span>
        {shipmentCount > 1 && (
          <span className="text-muted-foreground">
            ({shipmentCount} total shipments)
          </span>
        )}
      </div>

      {/* Timeline nodes */}
      <div className="relative pl-4 border-l-2 border-muted space-y-3">
        {sortedShipments.map((shipment, index) => {
          const isExpanded = expandedId === shipment.id
          const _isLast = index === sortedShipments.length - 1

          return (
            <div key={shipment.id} className="relative">
              {/* Timeline node */}
              <div
                className={cn(
                  'absolute -left-[21px] w-4 h-4 rounded-full border-2 border-background',
                  showStatus ? getStatusColor(shipment.status) : 'bg-primary'
                )}
              />

              {/* Shipment card */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : shipment.id)}
                className="w-full text-left pl-4 hover:bg-muted/50 rounded-md p-2 -ml-2 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {shipment.collectionName ?? 'Available to Ship'}
                    </span>
                    {showStatus && shipment.status && (
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded',
                        shipment.status === 'Fulfilled' && 'bg-green-100 text-green-700',
                        shipment.status === 'PartiallyFulfilled' && 'bg-amber-100 text-amber-700',
                        shipment.status === 'Planned' && 'bg-blue-100 text-blue-700',
                        shipment.status === 'Cancelled' && 'bg-red-100 text-red-700',
                      )}>
                        {shipment.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {formatShortDate(shipment.plannedShipStart)} - {formatShortDate(shipment.plannedShipEnd)}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t text-sm text-muted-foreground">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <span className="text-xs uppercase tracking-wide">Ship Start</span>
                        <p className="font-medium text-foreground">{shipment.plannedShipStart}</p>
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-wide">Ship End</span>
                        <p className="font-medium text-foreground">{shipment.plannedShipEnd}</p>
                      </div>
                    </div>
                    
                    {/* Item contents */}
                    {shipment.items && shipment.items.length > 0 ? (
                      <div className="space-y-1">
                        <span className="text-xs uppercase tracking-wide">Items ({shipment.items.length})</span>
                        <ul className="space-y-1 mt-1">
                          {shipment.items.slice(0, 5).map((item) => (
                            <li key={item.sku} className="flex justify-between text-xs">
                              <span className="font-mono">{item.sku}</span>
                              <span className="text-muted-foreground">x{item.quantity}</span>
                            </li>
                          ))}
                          {shipment.items.length > 5 && (
                            <li className="text-xs text-muted-foreground">
                              ...and {shipment.items.length - 5} more items
                            </li>
                          )}
                        </ul>
                      </div>
                    ) : shipment.itemCount !== undefined && (
                      <div>
                        <span className="text-xs uppercase tracking-wide">Items</span>
                        <p className="font-medium text-foreground">{shipment.itemCount}</p>
                      </div>
                    )}
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
