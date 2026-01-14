'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import { EditShipmentModal } from './edit-shipment-modal'
import { ShipmentModal } from './shipment-modal'
import { OrderAdjustments } from './order-adjustments'
import { formatCurrency, cn } from '@/lib/utils'
import { getTrackingUrl } from '@/lib/types/shipment'
import { updateOrderDetails } from '@/lib/data/actions/orders'
import type { ShipmentRow, Carrier } from '@/lib/types/shipment'
import { Pencil, X, Check, Loader2 } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface OrderItem {
  id: string
  sku: string
  quantity: number
  price: number
  currency: 'USD' | 'CAD'
  shippedQuantity: number
}

interface ShipmentHistoryProps {
  orderId: string
  orderNumber: string
  orderAmount: number
  orderStatus: string
  shipments: ShipmentRow[]
  currency: 'USD' | 'CAD'
}

// ============================================================================
// Line Items Section with Adjustments
// ============================================================================

interface LineItemsSectionProps {
  orderId: string
  orderNumber: string
  orderStatus: string
  items: OrderItem[]
  currency: 'USD' | 'CAD'
}

export function LineItemsSection({
  orderId,
  orderNumber,
  orderStatus,
  items,
  currency,
}: LineItemsSectionProps) {
  const itemsTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <div>
      <OrderAdjustments
        orderId={orderId}
        orderNumber={orderNumber}
        orderStatus={orderStatus}
        items={items}
        currency={currency}
      />
      <div className="mt-4 pt-3 border-t border-border flex justify-end">
        <div className="text-sm">
          <span className="text-muted-foreground mr-3">Items total</span>
          <span className="font-semibold">{formatCurrency(itemsTotal, currency)}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Shipment History with Edit
// ============================================================================

export function ShipmentHistory({
  orderId,
  orderNumber,
  orderAmount,
  orderStatus,
  shipments,
  currency,
}: ShipmentHistoryProps) {
  const [editingShipment, setEditingShipment] = React.useState<ShipmentRow | null>(null)
  const [showCreateShipment, setShowCreateShipment] = React.useState(false)

  const totalShipped = shipments.reduce((sum, s) => sum + s.shippedTotal, 0)
  const variance = totalShipped - orderAmount

  const canCreateShipment = orderStatus !== 'Invoiced' && orderStatus !== 'Cancelled'

  return (
    <div className="space-y-4">
      {/* Header with totals */}
      <div className="flex items-center justify-between">
        {shipments.length > 0 && (
          <div className="text-sm">
            <span className="text-muted-foreground">Shipped Total: </span>
            <span className="font-semibold">{formatCurrency(totalShipped, currency)}</span>
            <span className="mx-2 text-muted-foreground">|</span>
            <span className="text-muted-foreground">Variance: </span>
            <span
              className={cn(
                'font-semibold',
                variance < 0 && 'text-destructive',
                variance > 0 && 'text-success',
                variance === 0 && 'text-muted-foreground'
              )}
            >
              {variance >= 0 ? '+' : ''}
              {formatCurrency(variance, currency)}
            </span>
          </div>
        )}
        {canCreateShipment && (
          <Button size="sm" onClick={() => setShowCreateShipment(true)}>
            + Create Shipment
          </Button>
        )}
      </div>

      {/* Shipments List */}
      {shipments.length === 0 ? (
        <div className="text-sm text-muted-foreground">No shipments recorded yet.</div>
      ) : (
        shipments.map((shipment, index) => (
          <div
            key={shipment.id}
            className="rounded-lg border border-border bg-background p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-medium">
                  Shipment #{index + 1}
                  {shipment.shipDate && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {new Date(shipment.shipDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Created by {shipment.createdBy} on{' '}
                  {new Date(shipment.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="text-right">
                  <div className="font-semibold">
                    {formatCurrency(shipment.shippedTotal, currency)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Items: {formatCurrency(shipment.shippedSubtotal, currency)} +
                    Shipping: {formatCurrency(shipment.shippingCost, currency)}
                  </div>
                </div>
                {canCreateShipment && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingShipment(shipment)}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Tracking Numbers */}
            {shipment.tracking.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {shipment.tracking.map((t) => {
                  const trackingUrl = getTrackingUrl(t.carrier as Carrier, t.trackingNumber)
                  return (
                    <div
                      key={t.id}
                      className="inline-flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs"
                    >
                      <span className="font-medium">{t.carrier}:</span>
                      {trackingUrl ? (
                        <a
                          href={trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {t.trackingNumber}
                        </a>
                      ) : (
                        <span>{t.trackingNumber}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Shipped Items */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1 pr-4">SKU</th>
                    <th className="py-1 pr-4 text-right">Qty Shipped</th>
                    <th className="py-1 pr-4 text-right">Unit Price</th>
                    <th className="py-1 pr-4 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {shipment.items.map((item) => (
                    <tr key={item.id} className="border-b border-border/50">
                      <td className="py-1 pr-4 font-mono text-xs">{item.sku}</td>
                      <td className="py-1 pr-4 text-right">{item.shippedQuantity}</td>
                      <td className="py-1 pr-4 text-right">
                        {formatCurrency(item.priceOverride ?? item.unitPrice, currency)}
                        {item.priceOverride && (
                          <span className="ml-1 text-xs text-muted-foreground line-through">
                            {formatCurrency(item.unitPrice, currency)}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-4 text-right font-medium">
                        {formatCurrency(item.lineTotal, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {shipment.internalNotes && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-xs text-muted-foreground">Notes:</div>
                <div className="text-sm">{shipment.internalNotes}</div>
              </div>
            )}
          </div>
        ))
      )}

      {/* Edit Shipment Modal */}
      <EditShipmentModal
        shipment={editingShipment}
        currency={currency}
        open={!!editingShipment}
        onOpenChange={(open) => !open && setEditingShipment(null)}
      />

      {/* Create Shipment Modal */}
      <ShipmentModal
        orderId={orderId}
        orderNumber={orderNumber}
        orderAmount={orderAmount}
        currency={currency}
        open={showCreateShipment}
        onOpenChange={setShowCreateShipment}
      />
    </div>
  )
}

// ============================================================================
// PDF Settings Card
// ============================================================================

const PAYMENT_TERMS_OPTIONS = [
  'Net 30',
  'Net 60',
  'Net 90',
  'COD',
  'Due on Receipt',
  'Prepaid',
]

interface PDFSettingsCardProps {
  orderId: string
  paymentTerms: string
  approvalDate: string
  brandNotes: string
}

export function PDFSettingsCard({
  orderId,
  paymentTerms: initialPaymentTerms,
  approvalDate: initialApprovalDate,
  brandNotes: initialBrandNotes,
}: PDFSettingsCardProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  const [paymentTerms, setPaymentTerms] = React.useState(initialPaymentTerms)
  const [approvalDate, setApprovalDate] = React.useState(initialApprovalDate)
  const [brandNotes, setBrandNotes] = React.useState(initialBrandNotes)

  // Reset form when canceling
  const handleCancel = () => {
    setPaymentTerms(initialPaymentTerms)
    setApprovalDate(initialApprovalDate)
    setBrandNotes(initialBrandNotes)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await updateOrderDetails({
        orderId,
        paymentTerms,
        approvalDate: approvalDate || null,
        brandNotes,
      })
      if (result.success) {
        setIsEditing(false)
        router.refresh()
      } else {
        console.error('Failed to save:', result.error)
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">PDF Settings</CardTitle>
        {!isEditing ? (
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
              <X className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Payment Terms */}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Payment Terms</span>
          {isEditing ? (
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-32 h-8 px-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="">Select...</option>
              {PAYMENT_TERMS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-medium">{paymentTerms || '—'}</span>
          )}
        </div>

        {/* Approval Date */}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Approval Date</span>
          {isEditing ? (
            <Input
              type="date"
              value={approvalDate}
              onChange={(e) => setApprovalDate(e.target.value)}
              className="w-36 h-8"
            />
          ) : (
            <span className="font-medium">{approvalDate || '—'}</span>
          )}
        </div>

        {/* Brand Notes */}
        <div className="space-y-1">
          <span className="text-muted-foreground">Brand Notes</span>
          {isEditing ? (
            <textarea
              value={brandNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBrandNotes(e.target.value)}
              placeholder="Internal notes for the brand (shown on PDF)"
              className="w-full min-h-[80px] text-sm px-3 py-2 rounded-md border border-input bg-background resize-y"
            />
          ) : (
            <div className="text-sm whitespace-pre-wrap">
              {brandNotes || '—'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
