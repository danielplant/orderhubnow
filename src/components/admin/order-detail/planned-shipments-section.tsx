'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { PlannedShipmentCard } from './planned-shipment-card'
import type { PlannedShipmentDisplay } from '@/lib/types/planned-shipment'
import type { Currency } from '@/lib/types'

interface PlannedShipmentsSectionProps {
  orderId: string
  shipments: PlannedShipmentDisplay[]
  currency: Currency
  editable: boolean
}

export function PlannedShipmentsSection({
  orderId,
  shipments,
  currency,
  editable,
}: PlannedShipmentsSectionProps) {
  if (shipments.length === 0) {
    return null
  }

  const totalAmount = shipments.reduce((sum, s) => sum + s.subtotal, 0)

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Planned Shipments
          </CardTitle>
          <Badge variant="default" size="sm" className="px-2 text-xs">
            {shipments.length} shipment{shipments.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {shipments.map((shipment, index) => (
          <PlannedShipmentCard
            key={shipment.id}
            shipment={shipment}
            index={index}
            currency={currency}
            editable={editable}
            allShipments={shipments}
            orderId={orderId}
          />
        ))}

        <div className="flex justify-end pt-2 border-t">
          <div className="text-sm">
            <span className="text-muted-foreground">Shipments Total: </span>
            <span className="font-semibold">{formatCurrency(totalAmount, currency)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
