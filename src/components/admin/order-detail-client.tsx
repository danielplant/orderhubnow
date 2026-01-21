'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, FeatureInterestModal } from '@/components/ui'
import { EditShipmentModal } from './edit-shipment-modal'
import { ShipmentModal } from './shipment-modal'
import { VoidShipmentDialog } from './void-shipment-dialog'
import { ResendEmailDialog } from './resend-email-dialog'
import { OrderAdjustments } from './order-adjustments'
import { formatCurrency, cn } from '@/lib/utils'
import { formatDate, formatDateTime } from '@/lib/utils/format'
import { getTrackingUrl } from '@/lib/types/shipment'
import { updateOrderDetails } from '@/lib/data/actions/orders'
import { syncOrderStatusFromShopify } from '@/lib/data/actions/shopify'
import { syncFulfillmentsFromShopify } from '@/lib/data/actions/fulfillment-sync'
import type { ShipmentRow, Carrier, LineItemStatus, CancelReason } from '@/lib/types/shipment'
import { Pencil, X, Check, Loader2, RefreshCw, RotateCcw, FileText, Printer, Mail, Ban } from 'lucide-react'

const RETURNS_OPTIONS = [
  'Generate RMA number',
  'Send return label to customer',
  'Create credit memo',
  'Track returned items',
]

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
  cancelledQuantity: number
  remainingQuantity: number
  status: LineItemStatus
  cancelledReason: CancelReason | null
  cancelledAt: string | null
  cancelledBy: string | null
}

interface ShipmentHistoryProps {
  orderId: string
  orderNumber: string
  orderAmount: number
  orderStatus: string
  shipments: ShipmentRow[]
  currency: 'USD' | 'CAD'
  customerEmail?: string
  repEmail?: string
  repName?: string
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
  customerEmail,
  repEmail,
  repName,
}: ShipmentHistoryProps) {
  const [editingShipment, setEditingShipment] = React.useState<ShipmentRow | null>(null)
  const [showCreateShipment, setShowCreateShipment] = React.useState(false)
  const [voidingShipment, setVoidingShipment] = React.useState<{ id: string; number: number } | null>(null)
  const [resendingEmail, setResendingEmail] = React.useState<{
    shipmentId: string
    shipmentNumber: number
    recipient: 'customer' | 'rep'
    email: string
    hasTracking: boolean
  } | null>(null)

  // Calculate totals excluding voided shipments
  const activeShipments = shipments.filter((s) => !s.isVoided)
  const totalShipped = activeShipments.reduce((sum, s) => sum + s.shippedTotal, 0)
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
        shipments.map((shipment, index) => {
          const hasTracking = shipment.tracking.length > 0
          return (
            <div
              key={shipment.id}
              className={cn(
                'rounded-lg border border-border bg-background p-4',
                shipment.isVoided && 'opacity-60 bg-muted/50'
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <span className={shipment.isVoided ? 'line-through' : ''}>
                      Shipment #{index + 1}
                    </span>
                    {shipment.isVoided && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        <Ban className="h-3 w-3" />
                        Voided
                      </span>
                    )}
                    {shipment.shipDate && !shipment.isVoided && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {formatDate(shipment.shipDate)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created by {shipment.createdBy} on{' '}
                    {formatDateTime(shipment.createdAt)}
                  </div>
                  {shipment.isVoided && shipment.voidedAt && (
                    <div className="text-xs text-destructive mt-1">
                      Voided by {shipment.voidedBy} on{' '}
                      {formatDate(shipment.voidedAt)} - {shipment.voidReason}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-4">
                  <div className="text-right">
                    <div className={cn('font-semibold', shipment.isVoided && 'line-through')}>
                      {formatCurrency(shipment.shippedTotal, currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Items: {formatCurrency(shipment.shippedSubtotal, currency)} +
                      Shipping: {formatCurrency(shipment.shippingCost, currency)}
                    </div>
                  </div>
                  {!shipment.isVoided && (
                    <div className="flex gap-2">
                      <FeatureInterestModal
                        feature="Returns"
                        trigger={
                          <Button variant="outline" size="sm">
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Return
                          </Button>
                        }
                        question="What would you expect when requesting a return?"
                        options={RETURNS_OPTIONS}
                        context={{ orderId, orderNumber }}
                      />
                      {canCreateShipment && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingShipment(shipment)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setVoidingShipment({ id: shipment.id, number: index + 1 })
                            }
                          >
                            <Ban className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                            Void
                          </Button>
                        </>
                      )}
                    </div>
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

            {/* Document Downloads */}
            <div className="mb-3 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Documents:</span>
              <a
                href={`/api/shipments/${shipment.id}/packing-slip`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-orange-50 hover:bg-orange-100 text-orange-700 px-2 py-1 transition-colors"
              >
                <Printer className="h-3 w-3" />
                Packing Slip
              </a>
              <a
                href={`/api/shipments/${shipment.id}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 transition-colors"
              >
                <FileText className="h-3 w-3" />
                Invoice
              </a>
            </div>

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

            {/* Notifications Row */}
            {!shipment.isVoided && (customerEmail || repEmail) && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Notifications:</span>
                  {customerEmail && (
                    <button
                      type="button"
                      onClick={() =>
                        setResendingEmail({
                          shipmentId: shipment.id,
                          shipmentNumber: index + 1,
                          recipient: 'customer',
                          email: customerEmail,
                          hasTracking,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 px-2 py-1 transition-colors"
                    >
                      <Mail className="h-3 w-3" />
                      Resend to Customer
                    </button>
                  )}
                  {repEmail && (
                    <button
                      type="button"
                      onClick={() =>
                        setResendingEmail({
                          shipmentId: shipment.id,
                          shipmentNumber: index + 1,
                          recipient: 'rep',
                          email: repEmail,
                          hasTracking,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-green-50 hover:bg-green-100 text-green-700 px-2 py-1 transition-colors"
                    >
                      <Mail className="h-3 w-3" />
                      Resend to Rep
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {shipment.internalNotes && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-xs text-muted-foreground">Notes:</div>
                <div className="text-sm">{shipment.internalNotes}</div>
              </div>
            )}
          </div>
          )
        })
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
        customerEmail={customerEmail}
        repEmail={repEmail}
        repName={repName}
        open={showCreateShipment}
        onOpenChange={setShowCreateShipment}
      />

      {/* Void Shipment Dialog */}
      {voidingShipment && (
        <VoidShipmentDialog
          shipmentId={voidingShipment.id}
          shipmentNumber={voidingShipment.number}
          open={!!voidingShipment}
          onOpenChange={(open) => !open && setVoidingShipment(null)}
        />
      )}

      {/* Resend Email Dialog */}
      {resendingEmail && (
        <ResendEmailDialog
          shipmentId={resendingEmail.shipmentId}
          shipmentNumber={resendingEmail.shipmentNumber}
          recipient={resendingEmail.recipient}
          email={resendingEmail.email}
          hasTracking={resendingEmail.hasTracking}
          open={!!resendingEmail}
          onOpenChange={(open) => !open && setResendingEmail(null)}
        />
      )}
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

// ============================================================================
// Shopify Status Card
// ============================================================================

function formatShopifyStatus(status: string | null | undefined): string {
  if (!status) return 'Unfulfilled'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getStatusColor(status: string | null | undefined, type: 'fulfillment' | 'financial'): string {
  if (!status) {
    return type === 'fulfillment' ? 'text-warning' : 'text-muted-foreground'
  }
  
  if (type === 'fulfillment') {
    if (status === 'fulfilled') return 'text-success'
    if (status === 'partial') return 'text-warning'
    return 'text-muted-foreground'
  }
  
  // financial
  if (status === 'paid') return 'text-success'
  if (status === 'pending') return 'text-warning'
  if (status === 'refunded' || status === 'voided') return 'text-destructive'
  return 'text-muted-foreground'
}

interface ShopifyStatusCardProps {
  orderId: string
  shopifyOrderId: string
  fulfillmentStatus: string | null | undefined
  financialStatus: string | null | undefined
  lastSyncedAt: string | null
}

export function ShopifyStatusCard({
  orderId,
  shopifyOrderId,
  fulfillmentStatus,
  financialStatus,
  lastSyncedAt,
}: ShopifyStatusCardProps) {
  const router = useRouter()
  const [isSyncingStatus, setIsSyncingStatus] = React.useState(false)
  const [isSyncingFulfillments, setIsSyncingFulfillments] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fulfillmentSyncResult, setFulfillmentSyncResult] = React.useState<string | null>(null)

  const handleSyncStatus = async () => {
    setIsSyncingStatus(true)
    setError(null)
    setFulfillmentSyncResult(null)
    try {
      const result = await syncOrderStatusFromShopify(orderId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error || 'Failed to sync')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sync')
    } finally {
      setIsSyncingStatus(false)
    }
  }

  const handleSyncFulfillments = async () => {
    setIsSyncingFulfillments(true)
    setError(null)
    setFulfillmentSyncResult(null)
    try {
      const result = await syncFulfillmentsFromShopify(orderId)
      if (result.success) {
        if (result.shipmentsCreated > 0) {
          setFulfillmentSyncResult(`Synced ${result.shipmentsCreated} shipment(s)`)
        } else {
          setFulfillmentSyncResult('No new fulfillments to sync')
        }
        router.refresh()
      } else {
        setError(result.error || 'Failed to sync fulfillments')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sync fulfillments')
    } finally {
      setIsSyncingFulfillments(false)
    }
  }

  const isSyncing = isSyncingStatus || isSyncingFulfillments

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Shopify Status</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSyncStatus}
          disabled={isSyncing}
          title="Sync status from Shopify"
        >
          <RefreshCw className={cn('h-4 w-4', isSyncingStatus && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Shopify Order ID</span>
          <span className="font-mono text-xs">{shopifyOrderId}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Fulfillment</span>
          <span className={cn('font-medium', getStatusColor(fulfillmentStatus, 'fulfillment'))}>
            {formatShopifyStatus(fulfillmentStatus)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Payment</span>
          <span className={cn('font-medium', getStatusColor(financialStatus, 'financial'))}>
            {formatShopifyStatus(financialStatus)}
          </span>
        </div>
        <div className="flex justify-between gap-4 pt-2 border-t border-border">
          <span className="text-muted-foreground">Last Synced</span>
          <span className="text-xs text-muted-foreground">
            {lastSyncedAt ? formatDateTime(lastSyncedAt) : 'Never'}
          </span>
        </div>
        
        {/* Sync Fulfillments Button */}
        <div className="pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncFulfillments}
            disabled={isSyncing}
            className="w-full"
          >
            {isSyncingFulfillments ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Fulfillments
              </>
            )}
          </Button>
        </div>

        {fulfillmentSyncResult && (
          <div className="text-xs text-success pt-1">{fulfillmentSyncResult}</div>
        )}
        {error && (
          <div className="text-xs text-destructive pt-1">{error}</div>
        )}
      </CardContent>
    </Card>
  )
}
