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
  createShipment,
  getOrderItemsWithFulfillment,
  updateOrderEmail,
} from '@/lib/data/actions/shipments'
import type {
  CreateShipmentInput,
  ShipmentItemInput,
  Carrier,
  OrderItemWithFulfillment,
} from '@/lib/types/shipment'
import { CARRIERS } from '@/lib/types/shipment'
import { formatCurrency, cn } from '@/lib/utils'
import { Minus, Plus, Loader2, Check, ChevronRight, Package, FileText, Download, Printer, AlertTriangle, Mail, Eye, Pencil } from 'lucide-react'
import { EditEmailModal } from './edit-email-modal'
import { EmailPreviewModal } from './email-preview-modal'
import { isValidEmail, getEmailValidationMessage } from '@/lib/utils/email'

interface ShipmentModalProps {
  orderId: string | null
  orderNumber: string | null
  orderAmount: number
  currency: 'USD' | 'CAD'
  open: boolean
  onOpenChange: (open: boolean) => void
  customerEmail?: string
  repEmail?: string
  repName?: string
}

interface ItemSelection {
  selected: boolean
  quantity: number
  priceOverride?: number
}

interface CreatedShipmentInfo {
  shipmentId: string
  unitsShipped: number
  totalAmount: number
  hasTracking: boolean
  trackingNumber?: string
  carrier?: string
  emailsSent?: {
    customer?: { email: string; attachments: string[] }
    rep?: { email: string }
    shopify?: boolean
  }
}

type Step = 'items' | 'details' | 'review' | 'success'

const STEPS: { key: Step; label: string }[] = [
  { key: 'items', label: 'Select Items' },
  { key: 'details', label: 'Shipping Details' },
  { key: 'review', label: 'Review & Confirm' },
]

export function ShipmentModal({
  orderId,
  orderNumber,
  orderAmount,
  currency,
  open,
  onOpenChange,
  customerEmail,
  repEmail,
  repName,
}: ShipmentModalProps) {
  const router = useRouter()

  // Step state
  const [currentStep, setCurrentStep] = React.useState<Step>('items')

  // Loading states
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  // Order items
  const [orderItems, setOrderItems] = React.useState<OrderItemWithFulfillment[]>([])
  const [selections, setSelections] = React.useState<Map<string, ItemSelection>>(new Map())

  // Shipment details
  const [shippingCost, setShippingCost] = React.useState('')
  const [carrier, setCarrier] = React.useState<Carrier>('UPS')
  const [trackingNumber, setTrackingNumber] = React.useState('')
  const [shipDate, setShipDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = React.useState('')

  // Notification options
  const [notifyCustomer, setNotifyCustomer] = React.useState(false)
  const [attachInvoice, setAttachInvoice] = React.useState(false)
  const [attachPackingSlip, setAttachPackingSlip] = React.useState(false)
  const [notifyRep, setNotifyRep] = React.useState(false)
  const [notifyShopify, setNotifyShopify] = React.useState(false)

  // Email override state
  const [emailOverride, setEmailOverride] = React.useState<string | null>(null)
  const [showEditEmail, setShowEditEmail] = React.useState(false)
  const [showEmailPreview, setShowEmailPreview] = React.useState(false)

  // Validation
  const [validationError, setValidationError] = React.useState<string | null>(null)

  // Stock warnings
  const [stockWarnings, setStockWarnings] = React.useState<Array<{
    sku: string
    requestedQty: number
    availableQty: number
    message: string | null
  }>>([])
  const [isCheckingStock, setIsCheckingStock] = React.useState(false)

  // Effective customer email (override or original)
  const effectiveCustomerEmail = emailOverride || customerEmail || ''
  const customerEmailWarning = getEmailValidationMessage(effectiveCustomerEmail)
  const hasValidCustomerEmail = !customerEmailWarning

  // Success state - stores created shipment info
  const [createdShipment, setCreatedShipment] = React.useState<CreatedShipmentInfo | null>(null)

  // Load order items when modal opens
  React.useEffect(() => {
    if (open && orderId) {
      setIsLoading(true)
      setCurrentStep('items')
      setCreatedShipment(null) // Reset success state
      getOrderItemsWithFulfillment(orderId)
        .then((items) => {
          setOrderItems(items)
          const newSelections = new Map<string, ItemSelection>()
          for (const item of items) {
            newSelections.set(item.id, {
              selected: item.remainingQuantity > 0,
              quantity: item.remainingQuantity,
            })
          }
          setSelections(newSelections)
        })
        .finally(() => setIsLoading(false))
    } else {
      setOrderItems([])
      setSelections(new Map())
      setShippingCost('')
      setCarrier('UPS')
      setTrackingNumber('')
      setShipDate(new Date().toISOString().slice(0, 10))
      setNotes('')
      setCurrentStep('items')
      setValidationError(null)
      // Reset notification state
      setNotifyCustomer(false)
      setAttachInvoice(false)
      setAttachPackingSlip(false)
      setNotifyRep(false)
      setNotifyShopify(false)
      setEmailOverride(null)
    }
  }, [open, orderId])

  // Toggle item selection
  const toggleItem = (itemId: string) => {
    setSelections((prev) => {
      const current = prev.get(itemId)
      if (!current) return prev
      const next = new Map(prev)
      next.set(itemId, { ...current, selected: !current.selected })
      return next
    })
    setValidationError(null)
  }

  // Update item quantity
  const updateQuantity = (itemId: string, qty: number) => {
    setSelections((prev) => {
      const current = prev.get(itemId)
      if (!current) return prev
      const item = orderItems.find((i) => i.id === itemId)
      const maxQty = item?.remainingQuantity ?? 0
      const next = new Map(prev)
      next.set(itemId, {
        ...current,
        quantity: Math.max(0, Math.min(qty, maxQty)),
        selected: qty > 0,
      })
      return next
    })
    setValidationError(null)
  }

  // Increment/decrement quantity
  const incrementQuantity = (itemId: string) => {
    const current = selections.get(itemId)
    if (current) {
      updateQuantity(itemId, current.quantity + 1)
    }
  }

  const decrementQuantity = (itemId: string) => {
    const current = selections.get(itemId)
    if (current) {
      updateQuantity(itemId, current.quantity - 1)
    }
  }

  // Select all remaining items
  const selectAllRemaining = () => {
    setSelections((prev) => {
      const next = new Map(prev)
      for (const item of orderItems) {
        if (item.remainingQuantity > 0) {
          next.set(item.id, {
            selected: true,
            quantity: item.remainingQuantity,
          })
        }
      }
      return next
    })
    setValidationError(null)
  }

  // Deselect all items
  const deselectAll = () => {
    setSelections((prev) => {
      const next = new Map(prev)
      for (const item of orderItems) {
        next.set(item.id, {
          selected: false,
          quantity: 0,
        })
      }
      return next
    })
  }

  // Calculate totals
  const selectedItems = orderItems.filter((item) => {
    const sel = selections.get(item.id)
    return sel?.selected && sel.quantity > 0
  })

  const totalSelectedUnits = selectedItems.reduce((sum, item) => {
    const sel = selections.get(item.id)!
    return sum + sel.quantity
  }, 0)

  const shippedSubtotal = selectedItems.reduce((sum, item) => {
    const sel = selections.get(item.id)!
    const price = sel.priceOverride ?? item.unitPrice
    return sum + price * sel.quantity
  }, 0)

  const shippingCostNum = parseFloat(shippingCost) || 0
  const shippedTotal = shippedSubtotal + shippingCostNum
  const variance = shippedTotal - orderAmount

  // Items with remaining quantity
  const itemsWithRemaining = orderItems.filter((item) => item.remainingQuantity > 0)
  const allSelected = itemsWithRemaining.every((item) => {
    const sel = selections.get(item.id)
    return sel?.selected && sel.quantity === item.remainingQuantity
  })

  // Step navigation
  const canProceedToDetails = selectedItems.length > 0

  // Check stock levels for selected items
  const checkStockLevels = React.useCallback(async () => {
    if (selectedItems.length === 0) return

    setIsCheckingStock(true)
    try {
      const items = selectedItems.map((item) => ({
        sku: item.sku,
        quantity: selections.get(item.id)?.quantity || 0,
      }))

      const response = await fetch('/api/shipments/stock-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })

      if (response.ok) {
        const data = await response.json()
        setStockWarnings(data.warnings || [])
      }
    } catch (error) {
      console.error('Stock check error:', error)
    } finally {
      setIsCheckingStock(false)
    }
  }, [selectedItems, selections])

  const handleNext = async () => {
    if (currentStep === 'items') {
      if (!canProceedToDetails) {
        setValidationError('Please select at least one item to ship')
        return
      }
      setCurrentStep('details')
    } else if (currentStep === 'details') {
      // Check stock before moving to review
      await checkStockLevels()
      setCurrentStep('review')
    }
  }

  const handleBack = () => {
    if (currentStep === 'details') {
      setCurrentStep('items')
    } else if (currentStep === 'review') {
      setCurrentStep('details')
    }
  }

  // Handle create shipment
  const handleCreate = async () => {
    if (!orderId || selectedItems.length === 0) return

    // Confirmation for large shipments
    if (shippedTotal > 500 || totalSelectedUnits > 20) {
      const confirmed = window.confirm(
        `You are about to create a shipment for ${totalSelectedUnits} units totaling ${formatCurrency(shippedTotal, currency)}. Continue?`
      )
      if (!confirmed) return
    }

    setIsSaving(true)
    try {
      const items: ShipmentItemInput[] = selectedItems.map((item) => {
        const sel = selections.get(item.id)!
        return {
          orderItemId: item.id,
          quantityShipped: sel.quantity,
          priceOverride: sel.priceOverride,
        }
      })

      const input: CreateShipmentInput = {
        orderId,
        items,
        shippingCost: shippingCostNum,
        shipDate,
        notes: notes.trim() || undefined,
        notifyCustomer: notifyCustomer && hasValidCustomerEmail,
        attachInvoice,
        attachPackingSlip,
        notifyRep: notifyRep && !!repEmail,
        notifyShopify,
        customerEmailOverride: emailOverride || undefined,
      }

      if (trackingNumber.trim()) {
        input.tracking = {
          carrier,
          trackingNumber: trackingNumber.trim(),
        }
      }

      const result = await createShipment(input)

      if (result.success && result.shipmentId) {
        // Store shipment info for success screen
        setCreatedShipment({
          shipmentId: result.shipmentId,
          unitsShipped: totalSelectedUnits,
          totalAmount: shippedTotal,
          hasTracking: !!trackingNumber.trim(),
          trackingNumber: trackingNumber.trim() || undefined,
          carrier: trackingNumber.trim() ? carrier : undefined,
          emailsSent: result.emailsSent,
        })
        // Show success step instead of closing
        setCurrentStep('success')
        router.refresh()
      } else {
        toast.error('Failed to create shipment', {
          description: result.error || 'An unexpected error occurred',
        })
      }
    } catch {
      toast.error('Failed to create shipment', {
        description: 'An unexpected error occurred',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Quick ship - creates shipment with all remaining items immediately
  const handleQuickShip = async () => {
    selectAllRemaining()
    // Small delay to let state update, then proceed
    setTimeout(() => {
      setCurrentStep('review')
    }, 100)
  }

  if (!orderId) return null

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-6 w-6" />
            Create Shipment for Order {orderNumber}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper - Improved Layout (hidden on success) */}
        {currentStep !== 'success' && (
          <div className="flex items-center justify-between py-6 px-4 border-b bg-muted/30 rounded-lg mx-0">
            {STEPS.map((step, index) => (
              <React.Fragment key={step.key}>
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                      index < currentStepIndex && 'bg-green-500 text-white',
                      index === currentStepIndex && 'bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20',
                      index > currentStepIndex && 'bg-muted text-muted-foreground border-2 border-muted-foreground/30'
                    )}
                  >
                    {index < currentStepIndex ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-sm font-medium hidden sm:block',
                      index === currentStepIndex && 'text-foreground',
                      index !== currentStepIndex && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-1 mx-4 rounded-full transition-colors',
                      index < currentStepIndex ? 'bg-green-500' : 'bg-muted'
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            {/* Step 1: Select Items */}
            {currentStep === 'items' && (
              <div className="space-y-4">
                {/* Quick Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={allSelected ? deselectAll : selectAllRemaining}
                    >
                      {allSelected ? 'Deselect All' : 'Select All Remaining'}
                    </Button>
                    {itemsWithRemaining.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {selectedItems.length} of {itemsWithRemaining.length} items selected
                      </span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleQuickShip}
                    disabled={itemsWithRemaining.length === 0}
                  >
                    Quick Ship All
                  </Button>
                </div>

                {/* Validation Error */}
                {validationError && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    {validationError}
                  </div>
                )}

                {/* Items Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="w-12 p-3"></th>
                        <th className="text-left p-3 min-w-[140px]">SKU</th>
                        <th className="text-left p-3 min-w-[200px]">Product</th>
                        <th className="text-center p-3 w-20">Ordered</th>
                        <th className="text-center p-3 w-20">Shipped</th>
                        <th className="text-center p-3 w-24">Remaining</th>
                        <th className="text-center p-3 w-36">Ship Qty</th>
                        <th className="text-right p-3 w-24">Price</th>
                        <th className="text-right p-3 w-28">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orderItems.map((item) => {
                        const sel = selections.get(item.id)
                        const isSelected = sel?.selected ?? false
                        const qty = sel?.quantity ?? 0
                        const lineTotal = (sel?.priceOverride ?? item.unitPrice) * qty
                        const hasRemaining = item.remainingQuantity > 0

                        return (
                          <tr
                            key={item.id}
                            className={cn(
                              'transition-colors',
                              !hasRemaining && 'bg-muted/30 text-muted-foreground',
                              isSelected && hasRemaining && 'bg-primary/5'
                            )}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!hasRemaining}
                                onChange={() => toggleItem(item.id)}
                                className="h-4 w-4 rounded border-input accent-primary"
                              />
                            </td>
                            <td className="p-3">
                              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                                {item.shopifySku || item.sku}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="line-clamp-2" title={item.productName}>
                                {item.productName}
                              </span>
                            </td>
                            <td className="p-3 text-center">{item.orderedQuantity}</td>
                            <td className="p-3 text-center">{item.shippedQuantity}</td>
                            <td className="p-3 text-center">
                              <span
                                className={cn(
                                  'inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-medium',
                                  item.remainingQuantity === 0
                                    ? 'bg-success/10 text-success'
                                    : 'bg-warning/10 text-warning'
                                )}
                              >
                                {item.remainingQuantity}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => decrementQuantity(item.id)}
                                  disabled={!hasRemaining || qty <= 0}
                                  className="h-8 w-8 flex items-center justify-center rounded border border-input hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={item.remainingQuantity}
                                  value={qty}
                                  onChange={(e) =>
                                    updateQuantity(item.id, parseInt(e.target.value) || 0)
                                  }
                                  disabled={!hasRemaining}
                                  className="w-14 h-8 text-center rounded border border-input bg-background text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => incrementQuantity(item.id)}
                                  disabled={!hasRemaining || qty >= item.remainingQuantity}
                                  className="h-8 w-8 flex items-center justify-center rounded border border-input hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              {formatCurrency(item.unitPrice, currency)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {isSelected && qty > 0
                                ? formatCurrency(lineTotal, currency)
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {orderItems.length === 0 && (
                    <p className="text-sm text-muted-foreground p-6 text-center">
                      No items found for this order.
                    </p>
                  )}
                </div>

                {/* Selection Summary */}
                {selectedItems.length > 0 && (
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <span className="text-sm">
                      <strong>{selectedItems.length}</strong> items,{' '}
                      <strong>{totalSelectedUnits}</strong> units selected
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(shippedSubtotal, currency)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Shipping Details */}
            {currentStep === 'details' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="ship-date" className="text-sm font-medium">
                        Ship Date
                      </label>
                      <input
                        id="ship-date"
                        type="date"
                        value={shipDate}
                        onChange={(e) => setShipDate(e.target.value)}
                        className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="shipping-cost" className="text-sm font-medium">
                        Shipping Cost
                      </label>
                      <div className="relative mt-1.5">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <input
                          id="shipping-cost"
                          type="number"
                          min="0"
                          step="0.01"
                          value={shippingCost}
                          onChange={(e) => setShippingCost(e.target.value)}
                          className="w-full h-10 rounded-md border border-input bg-background pl-7 pr-3 text-sm"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="carrier" className="text-sm font-medium">
                        Carrier
                      </label>
                      <select
                        id="carrier"
                        value={carrier}
                        onChange={(e) => setCarrier(e.target.value as Carrier)}
                        className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {CARRIERS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="tracking" className="text-sm font-medium">
                        Tracking Number{' '}
                        <span className="text-muted-foreground font-normal">(optional)</span>
                      </label>
                      <input
                        id="tracking"
                        type="text"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        placeholder="Enter tracking number"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="notes" className="text-sm font-medium">
                    Internal Notes{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full rounded-md border border-input bg-background p-3 text-sm resize-none"
                    placeholder="Notes about this shipment..."
                  />
                </div>
              </div>
            )}

            {/* Step 3: Review & Confirm */}
            {currentStep === 'review' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Items */}
                <div className="space-y-4">
                  {/* Stock Warnings */}
                  {stockWarnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-amber-800">Stock Warning</h4>
                          <p className="text-sm text-amber-700 mt-1">
                            The following items have low or no stock. You can still create the shipment.
                          </p>
                          <ul className="mt-2 space-y-1">
                            {stockWarnings.map((warning) => (
                              <li key={warning.sku} className="text-sm text-amber-700">
                                <span className="font-mono font-medium">{warning.sku}</span>
                                {': '}
                                {warning.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {isCheckingStock && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking stock levels...
                    </div>
                  )}

                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-3 border-b">
                      <h3 className="font-semibold text-base">Items to Ship ({selectedItems.length})</h3>
                    </div>
                    <div className="divide-y max-h-[300px] overflow-y-auto">
                      {selectedItems.map((item) => {
                        const sel = selections.get(item.id)!
                        const lineTotal = (sel.priceOverride ?? item.unitPrice) * sel.quantity
                        return (
                          <div key={item.id} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-sm bg-muted px-2 py-1 rounded font-medium">
                                {item.shopifySku || item.sku}
                              </span>
                              <span className="text-muted-foreground text-lg">×</span>
                              <span className="font-bold text-lg">{sel.quantity}</span>
                            </div>
                            <span className="font-semibold text-base">{formatCurrency(lineTotal, currency)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Shipping Details Summary */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Shipping Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground block">Ship Date</span>
                        <span className="font-medium text-base">{shipDate}</span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground block">Carrier</span>
                        <span className="font-medium text-base">{carrier}</span>
                      </div>
                      {trackingNumber && (
                        <div className="col-span-2">
                          <span className="text-sm text-muted-foreground block">Tracking Number</span>
                          <span className="font-mono text-sm">{trackingNumber}</span>
                        </div>
                      )}
                    </div>
                    {notes && (
                      <div className="pt-3 border-t mt-3">
                        <span className="text-sm text-muted-foreground block">Notes</span>
                        <p className="text-sm mt-1">{notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Totals */}
                <div className="lg:sticky lg:top-0">
                  <div className="rounded-xl border-2 bg-gradient-to-b from-muted/30 to-muted/10 p-6">
                    <h3 className="font-semibold text-lg mb-4">Order Summary</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-2">
                        <span className="text-muted-foreground">
                          Items Subtotal ({totalSelectedUnits} units)
                        </span>
                        <span className="font-medium text-lg">{formatCurrency(shippedSubtotal, currency)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-muted-foreground">Shipping</span>
                        <span className="font-medium text-lg">
                          {shippingCostNum > 0 ? formatCurrency(shippingCostNum, currency) : '—'}
                        </span>
                      </div>
                      <div className="border-t-2 border-dashed pt-4 flex justify-between items-center">
                        <span className="font-bold text-lg">Shipment Total</span>
                        <span className="font-bold text-2xl">{formatCurrency(shippedTotal, currency)}</span>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-4 mt-4 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Original Order</span>
                          <span className="font-medium">{formatCurrency(orderAmount, currency)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-sm">Variance</span>
                          <span
                            className={cn(
                              'font-bold text-lg',
                              variance < 0 && 'text-red-600',
                              variance > 0 && 'text-green-600',
                              variance === 0 && 'text-muted-foreground'
                            )}
                          >
                            {variance >= 0 ? '+' : ''}
                            {formatCurrency(variance, currency)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Notification Options */}
                    <div className="rounded-lg border bg-muted/20 p-4 mt-4">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                        Email Notifications
                      </h4>
                      <div className="space-y-4">
                        {/* Customer Notification */}
                        <div className="rounded-md border bg-background p-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notifyCustomer}
                              onChange={(e) => setNotifyCustomer(e.target.checked)}
                              disabled={!hasValidCustomerEmail && !emailOverride}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <span className="text-sm font-medium">Send shipment confirmation to customer</span>
                          </label>
                          
                          {/* Email display / warning */}
                          <div className="mt-2 ml-7">
                            {hasValidCustomerEmail ? (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Mail className="h-3.5 w-3.5" />
                                  <span>{effectiveCustomerEmail}</span>
                                  {emailOverride && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                      Override
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowEditEmail(true)}
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  <Pencil className="h-3 w-3" />
                                  Edit
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-amber-600">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <span>{customerEmailWarning}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowEditEmail(true)}
                                  className="text-xs text-primary hover:underline"
                                >
                                  Add Email
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Attachment options */}
                          {notifyCustomer && hasValidCustomerEmail && (
                            <div className="mt-3 ml-7 space-y-2">
                              <p className="text-xs text-muted-foreground font-medium">Attachments:</p>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={attachInvoice}
                                  onChange={(e) => setAttachInvoice(e.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-gray-300"
                                />
                                <span className="text-sm">Invoice PDF</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={attachPackingSlip}
                                  onChange={(e) => setAttachPackingSlip(e.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-gray-300"
                                />
                                <span className="text-sm">Packing Slip PDF</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowEmailPreview(true)}
                                className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Preview Email
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Sales Rep Notification */}
                        <div className="rounded-md border bg-background p-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notifyRep}
                              onChange={(e) => setNotifyRep(e.target.checked)}
                              disabled={!repEmail}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <span className="text-sm font-medium">Notify sales rep</span>
                          </label>
                          {repEmail ? (
                            <div className="mt-2 ml-7 flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" />
                              <span>{repEmail}</span>
                              {repName && <span className="text-xs">({repName})</span>}
                            </div>
                          ) : (
                            <div className="mt-2 ml-7 flex items-center gap-2 text-sm text-muted-foreground">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              <span>No sales rep email on file</span>
                            </div>
                          )}
                        </div>

                        {/* Shopify Notification */}
                        <div className="rounded-md border bg-background p-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notifyShopify}
                              onChange={(e) => setNotifyShopify(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <span className="text-sm font-medium">Send Shopify fulfillment notification</span>
                          </label>
                          <p className="mt-1 ml-7 text-xs text-muted-foreground">
                            Shopify will send their standard shipping email to the customer
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Success */}
            {currentStep === 'success' && createdShipment && (
              <div className="py-8">
                {/* Success Icon */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-4">
                    <Check className="h-10 w-10 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Shipment Created!</h3>
                  <p className="text-muted-foreground">
                    {createdShipment.unitsShipped} unit{createdShipment.unitsShipped !== 1 ? 's' : ''} shipped for{' '}
                    {formatCurrency(createdShipment.totalAmount, currency)}
                  </p>
                </div>

                {/* Tracking Info (if added) */}
                {createdShipment.hasTracking && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
                    <p className="text-sm text-blue-800">
                      <strong>Tracking:</strong> {createdShipment.carrier} - {createdShipment.trackingNumber}
                    </p>
                  </div>
                )}

                {/* Notifications Sent */}
                <div className="bg-muted/30 rounded-xl p-6 mb-6">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Notifications
                  </h4>
                  {createdShipment.emailsSent && (createdShipment.emailsSent.customer || createdShipment.emailsSent.rep || createdShipment.emailsSent.shopify) ? (
                    <div className="space-y-3">
                      {createdShipment.emailsSent.customer && (
                        <div className="flex items-start gap-3 text-sm">
                          <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-foreground">
                              Customer confirmation sent to{' '}
                              <span className="font-medium">{createdShipment.emailsSent.customer.email}</span>
                            </p>
                            {createdShipment.emailsSent.customer.attachments.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Attachments: {createdShipment.emailsSent.customer.attachments.join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {createdShipment.emailsSent.rep && (
                        <div className="flex items-start gap-3 text-sm">
                          <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <p className="text-foreground">
                            Sales rep notification sent to{' '}
                            <span className="font-medium">{createdShipment.emailsSent.rep.email}</span>
                          </p>
                        </div>
                      )}
                      {createdShipment.emailsSent.shopify && (
                        <div className="flex items-start gap-3 text-sm">
                          <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <p className="text-foreground">Shopify fulfillment notification sent</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No email notifications were sent. You can send them later from the order detail page.
                    </p>
                  )}
                </div>

                {/* Document Download Section */}
                <div className="bg-muted/30 rounded-xl p-6 mb-6">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">
                    Download Documents
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Packing Slip */}
                    <a
                      href={`/api/shipments/${createdShipment.shipmentId}/packing-slip`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 p-4 bg-white border-2 border-transparent hover:border-primary rounded-lg transition-all group"
                    >
                      <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                        <Printer className="h-6 w-6 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">Packing Slip</p>
                        <p className="text-sm text-muted-foreground">For warehouse / fulfillment</p>
                      </div>
                      <Download className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                    </a>

                    {/* Shipping Invoice */}
                    <a
                      href={`/api/shipments/${createdShipment.shipmentId}/invoice`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 p-4 bg-white border-2 border-transparent hover:border-primary rounded-lg transition-all group"
                    >
                      <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                        <FileText className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">Shipping Invoice</p>
                        <p className="text-sm text-muted-foreground">For customer / billing</p>
                      </div>
                      <Download className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                    </a>
                  </div>
                </div>

                {/* Next Steps */}
                <div className="text-center text-sm text-muted-foreground mb-6">
                  <p>Documents will open in a new tab. You can also access them from the order detail page.</p>
                </div>

                {/* Actions */}
                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                  <Button onClick={() => {
                    setCurrentStep('items')
                    setCreatedShipment(null)
                    // Reload items to get updated quantities
                    if (orderId) {
                      setIsLoading(true)
                      getOrderItemsWithFulfillment(orderId)
                        .then((items) => {
                          setOrderItems(items)
                          const newSelections = new Map<string, ItemSelection>()
                          for (const item of items) {
                            newSelections.set(item.id, {
                              selected: item.remainingQuantity > 0,
                              quantity: item.remainingQuantity,
                            })
                          }
                          setSelections(newSelections)
                        })
                        .finally(() => setIsLoading(false))
                    }
                  }}>
                    Create Another Shipment
                  </Button>
                </div>
              </div>
            )}

            {/* Actions (not shown on success step) */}
            {currentStep !== 'success' && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div>
                  {currentStep !== 'items' && (
                    <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                  {currentStep !== 'review' ? (
                    <Button onClick={handleNext}>
                      Continue
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button onClick={handleCreate} disabled={isSaving || selectedItems.length === 0}>
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Create Shipment
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Edit Email Modal */}
      <EditEmailModal
        open={showEditEmail}
        onOpenChange={setShowEditEmail}
        currentEmail={customerEmail || ''}
        onSave={async (email, shouldUpdateOrder) => {
          if (shouldUpdateOrder && orderId) {
            const result = await updateOrderEmail(orderId, email)
            if (result.success) {
              toast.success('Email updated on order record')
            } else {
              toast.error(result.error || 'Failed to update email')
            }
          }
          setEmailOverride(email)
          // Enable customer notification if it was disabled due to missing email
          if (!notifyCustomer && isValidEmail(email)) {
            setNotifyCustomer(true)
          }
        }}
      />

      {/* Email Preview Modal */}
      <EmailPreviewModal
        open={showEmailPreview}
        onOpenChange={setShowEmailPreview}
        previewData={orderId && selectedItems.length > 0 ? {
          orderId,
          items: selectedItems.map((item) => {
            const sel = selections.get(item.id)!
            return {
              orderItemId: item.id,
              quantityShipped: sel.quantity,
              priceOverride: sel.priceOverride,
            }
          }),
          shippingCost: parseFloat(shippingCost) || 0,
          carrier: carrier,
          trackingNumber: trackingNumber || undefined,
          shipDate,
          customerEmail: effectiveCustomerEmail,
          attachInvoice,
          attachPackingSlip,
        } : null}
      />
    </Dialog>
  )
}
