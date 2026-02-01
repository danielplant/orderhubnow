'use client'

import { useEffect, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useOrder } from '@/lib/contexts/order-context'
import { useCurrency } from '@/lib/contexts/currency-context'
import { OrderForm } from '@/components/buyer/order-form'
import { SessionBackupToolbar } from '@/components/buyer/draft-toolbar'
import { SessionRecoveryBanner } from '@/components/buyer/draft-recovery-banner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShipmentTimeline } from '@/components/ui/shipment-timeline'
import { CurrencyToggle } from '@/components/buyer/currency-toggle'
import { formatCurrency } from '@/lib/utils'
import { updateOrderCurrency } from '@/lib/data/actions/orders'
import { Trash2 } from 'lucide-react'
import type { OrderForEditing } from '@/lib/data/queries/orders'
import type { CartPlannedShipment } from '@/lib/types/planned-shipment'
import {
  getATSDefaultDates,
  validateShipDates,
  getOverlapWindow,
  getMultiCollectionOverlap,
  getMinimumAllowedDates,
  type CollectionWindow,
} from '@/lib/validation/ship-window'

interface SkuData {
  skuVariantId: number
  priceCAD: number
  priceUSD: number
  description: string
  // Collection is the source of truth for order splitting
  collectionId: number | null
  collectionName: string | null
  // Ship window dates from Collection
  shipWindowStart: string | null
  shipWindowEnd: string | null
}

interface MyOrderClientProps {
  reps: Array<{ id: string; name: string; code: string }>
  skuMap: Record<string, SkuData>
  isPreOrder?: boolean
  existingOrder?: OrderForEditing | null
  returnTo?: string
  repContext?: { repId: string } | null
  draftId?: string | null
}

export function MyOrderClient({
  reps,
  skuMap,
  isPreOrder = false,
  existingOrder = null,
  returnTo = '/buyer/select-journey',
  repContext = null,
  draftId: urlDraftId = null,
}: MyOrderClientProps) {
  const router = useRouter()
  const {
    orders,
    totalItems,
    removeItem,
    setQuantity,
    loadDraft,
    draftId,
    loadOrderForEdit,
    clearEditMode,
    editOrderId,
    editOrderCurrency,
    setEditOrderCurrency,
    isEditMode: contextIsEditMode,
    isValidatingEditState,
    shipmentDateOverrides,
    updateShipmentDates,
    // Phase 5: Edit mode shipments
    editModeShipments,
    isEditModeWithShipments,
    // PR-3b: Shipment groupings (combine/split)
    shipmentGroups,
    combineShipments,
    splitShipment,
  } = useOrder()
  const { currency, setCurrency } = useCurrency()
  const hasLoadedOrderRef = useRef(false)

  // Resolve rep name from repContext.repId using the reps array
  const repName = repContext?.repId
    ? reps.find((r) => r.id === repContext.repId)?.name ?? `Rep #${repContext.repId}`
    : null

  // Load draft from URL param if present (only for non-edit mode)
  useEffect(() => {
    if (!existingOrder && urlDraftId && urlDraftId !== draftId) {
      loadDraft(urlDraftId)
    }
  }, [urlDraftId, draftId, loadDraft, existingOrder])

  // Load existing order into context when entering edit mode
  useEffect(() => {
    if (existingOrder && !hasLoadedOrderRef.current) {
      // Only load if we haven't already or if it's a different order
      if (editOrderId !== existingOrder.id) {
        loadOrderForEdit(existingOrder)
      }
      hasLoadedOrderRef.current = true
    }
  }, [existingOrder, editOrderId, loadOrderForEdit])

  // Determine if we're in edit mode (from props or context)
  const isEditMode = !!existingOrder || contextIsEditMode

  // Detect stale edit state: context thinks we're editing but server has no order
  // This happens when an order was deleted or status changed while user was away
  const shouldShowEditError = contextIsEditMode && !existingOrder && !isValidatingEditState

  // Track if initial currency sync has happened to avoid saving on mount
  const initialCurrencySyncRef = useRef(false)
  const [, startCurrencyTransition] = useTransition()

  // Sync currency toggle to order's currency when entering edit mode
  // This ensures the toggle starts at the order's currency, not the user's localStorage preference
  useEffect(() => {
    if (existingOrder?.currency && !initialCurrencySyncRef.current) {
      setCurrency(existingOrder.currency)
      initialCurrencySyncRef.current = true
    }
  }, [existingOrder, setCurrency])

  // Save currency changes immediately in edit mode
  useEffect(() => {
    // Skip if not in edit mode, no order ID, or initial sync hasn't happened yet
    if (!isEditMode || !editOrderId || !initialCurrencySyncRef.current) {
      return
    }

    // Skip if currency matches what's already in the order
    if (currency === editOrderCurrency) {
      return
    }

    startCurrencyTransition(async () => {
      const result = await updateOrderCurrency({
        orderId: editOrderId,
        currency,
      })

      if (result.success) {
        // Update context so subsequent toggles work correctly
        setEditOrderCurrency(currency)
        toast.success(`Currency updated to ${currency}`)
      } else {
        toast.error(result.error || 'Failed to update currency')
        // Revert toggle on error
        if (editOrderCurrency) {
          setCurrency(editOrderCurrency)
        }
      }
    })
  }, [currency, isEditMode, editOrderId, editOrderCurrency, setCurrency, setEditOrderCurrency])

  // Use currency from toggle (allows changing currency in edit mode)
  const effectiveCurrency = currency

  // Unified cart items from context - works for both new and edit mode
  // Uses Collection data for order splitting by delivery date
  const cartItems = useMemo(() => {
    const items: Array<{
      productId: string
      sku: string
      skuVariantId: number
      quantity: number
      price: number
      description: string
      collectionId: number | null
      collectionName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
    }> = []

    Object.entries(orders).forEach(([productId, skuQuantities]) => {
      Object.entries(skuQuantities).forEach(([sku, quantity]) => {
        const skuData = skuMap[sku]
        if (skuData && quantity > 0) {
          items.push({
            productId,
            sku,
            skuVariantId: skuData.skuVariantId,
            quantity,
            price: effectiveCurrency === 'CAD' ? skuData.priceCAD : skuData.priceUSD,
            description: skuData.description,
            collectionId: skuData.collectionId,
            collectionName: skuData.collectionName,
            shipWindowStart: skuData.shipWindowStart,
            shipWindowEnd: skuData.shipWindowEnd,
          })
        }
      })
    })

    return items
  }, [orders, skuMap, effectiveCurrency])

  // Compute planned shipments from cart items + date overrides
  // Phase 5: In edit mode, reconcile loaded shipments with current cart items
  const plannedShipments = useMemo((): CartPlannedShipment[] => {
    if (cartItems.length === 0) return []

    const atsDefaults = getATSDefaultDates()
    const shipments: CartPlannedShipment[] = []

    // Phase 5: Edit mode with loaded shipments - reconcile with cart
    if (isEditModeWithShipments && editModeShipments.size > 0) {
      const processedSkus = new Set<string>()

      // Find existing ATS shipment for date inheritance
      let existingATSShipment: { plannedShipStart: string; plannedShipEnd: string } | null = null
      for (const [, shipment] of editModeShipments) {
        if (shipment.collectionId === null) {
          existingATSShipment = {
            plannedShipStart: shipment.plannedShipStart,
            plannedShipEnd: shipment.plannedShipEnd,
          }
          break
        }
      }

      // 1. Process existing shipments from edit mode
      for (const [shipmentId, shipment] of editModeShipments) {
        // Find items still in cart that belong to this shipment
        const shipmentItems = cartItems.filter((item) =>
          shipment.itemSkus.includes(item.sku)
        )

        if (shipmentItems.length > 0) {
          // Use date overrides if user changed dates, otherwise use loaded dates
          const override = shipmentDateOverrides.get(shipmentId)

          // For combined shipments, reconstruct date constraints from items' collections
          // (combined shipments have CollectionID = null, so shipWindowStart/End are null)
          let minAllowedStart = shipment.shipWindowStart
          let minAllowedEnd = shipment.shipWindowEnd

          if (shipment.isCombined && !minAllowedStart && !minAllowedEnd) {
            // Get unique collection windows from the items in this shipment
            const collectionWindows = new Map<number, { start: string | null; end: string | null }>()
            for (const item of shipmentItems) {
              if (item.collectionId !== null && !collectionWindows.has(item.collectionId)) {
                collectionWindows.set(item.collectionId, {
                  start: item.shipWindowStart,
                  end: item.shipWindowEnd,
                })
              }
            }

            // Compute minimum allowed dates (most restrictive = latest dates)
            const starts = [...collectionWindows.values()]
              .map(w => w.start)
              .filter((d): d is string => d !== null)
            const ends = [...collectionWindows.values()]
              .map(w => w.end)
              .filter((d): d is string => d !== null)

            if (starts.length > 0) {
              minAllowedStart = starts.reduce((a, b) => (a > b ? a : b))
            }
            if (ends.length > 0) {
              minAllowedEnd = ends.reduce((a, b) => (a > b ? a : b))
            }
          }

          shipments.push({
            id: shipmentId,
            collectionId: shipment.collectionId,
            collectionName: shipment.collectionName,
            itemIds: shipmentItems.map((i) => i.sku),
            plannedShipStart: override?.start ?? shipment.plannedShipStart,
            plannedShipEnd: override?.end ?? shipment.plannedShipEnd,
            minAllowedStart,
            minAllowedEnd,
            // Propagate combined shipment tracking for Split button
            isCombined: shipment.isCombined,
            originalShipmentIds: shipment.originalShipmentIds ?? undefined,
          })
          shipmentItems.forEach((item) => processedSkus.add(item.sku))
        }
        // If no items remain, shipment will be deleted on save
      }

      // 2. Find items not in any loaded shipment (new items added during edit)
      const newItems = cartItems.filter((item) => !processedSkus.has(item.sku))

      if (newItems.length > 0) {
        // Group new items by collectionId
        const groups = new Map<number | null, typeof cartItems>()
        for (const item of newItems) {
          const key = item.collectionId ?? null
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(item)
        }

        // 3. Create new shipments for new collections
        groups.forEach((items, collectionId) => {
          const first = items[0]
          const shipmentId = `new-${collectionId ?? 'ats'}`

          // Check for user overrides on new shipments
          const override = shipmentDateOverrides.get(shipmentId)

          // Phase 5: ATS date preservation - inherit from existing ATS shipment
          let defaultStart: string
          let defaultEnd: string

          if (collectionId === null && existingATSShipment) {
            // Inherit dates from existing ATS shipment
            defaultStart = existingATSShipment.plannedShipStart
            defaultEnd = existingATSShipment.plannedShipEnd
          } else {
            // Use collection defaults or ATS defaults
            defaultStart = first.shipWindowStart ?? atsDefaults.start
            defaultEnd = first.shipWindowEnd ?? atsDefaults.end
          }

          shipments.push({
            id: shipmentId,
            collectionId,
            collectionName: first.collectionName ?? null,
            itemIds: items.map((i) => i.sku),
            plannedShipStart: override?.start ?? defaultStart,
            plannedShipEnd: override?.end ?? defaultEnd,
            minAllowedStart: first.shipWindowStart,
            minAllowedEnd: first.shipWindowEnd,
          })
        })
      }
    } else {
      // New order mode: compute from cart items (existing logic)
      const groups = new Map<number | null, typeof cartItems>()
      for (const item of cartItems) {
        const key = item.collectionId ?? null
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
      }

      groups.forEach((items, collectionId) => {
        const first = items[0]
        const shipmentId =
          collectionId !== null ? `shipment-${collectionId}` : 'shipment-default'

        // Check for user overrides
        const override = shipmentDateOverrides.get(shipmentId)

        // Default dates: collection window or ATS defaults
        const defaultStart = first.shipWindowStart ?? atsDefaults.start
        const defaultEnd = first.shipWindowEnd ?? atsDefaults.end

        shipments.push({
          id: shipmentId,
          collectionId,
          collectionName: first.collectionName ?? null,
          itemIds: items.map((i) => i.sku),
          plannedShipStart: override?.start ?? defaultStart,
          plannedShipEnd: override?.end ?? defaultEnd,
          minAllowedStart: first.shipWindowStart,
          minAllowedEnd: first.shipWindowEnd,
        })
      })
    }

    // PR-3b: Apply manual shipment groupings (combine)
    let finalShipments = shipments

    if (shipmentGroups.size > 0) {
      // Build set of all shipment IDs that are part of a group
      const groupedIds = new Set<string>()
      for (const [, originalIds] of shipmentGroups) {
        originalIds.forEach((id) => groupedIds.add(id))
      }

      // Filter out individual shipments that are part of a group
      const ungroupedShipments = shipments.filter((s) => !groupedIds.has(s.id))

      // Create combined shipments for each group
      const combinedShipments: CartPlannedShipment[] = []
      for (const [combinedId, originalIds] of shipmentGroups) {
        const shipmentsToMerge = shipments.filter((s) => originalIds.includes(s.id))
        if (shipmentsToMerge.length === 0) continue

        // Merge all items from grouped shipments
        const mergedItems = shipmentsToMerge.flatMap((s) => s.itemIds)
        
        // Get all collection windows
        const collectionWindows: CollectionWindow[] = shipmentsToMerge
          .filter((s) => s.minAllowedStart && s.minAllowedEnd)
          .map((s) => ({
            id: s.collectionId ?? 0,
            name: s.collectionName ?? '',
            shipWindowStart: s.minAllowedStart,
            shipWindowEnd: s.minAllowedEnd,
          }))
        
        // Calculate MINIMUM allowed dates (most restrictive = latest dates)
        // This ensures combined shipment can't have dates earlier than ANY collection's window
        const minimumDates = getMinimumAllowedDates(collectionWindows)
        
        // For default dates, use overlap if valid, otherwise use minimum allowed dates
        const overlapResult = getMultiCollectionOverlap(collectionWindows)
        
        // Check for user date overrides on the combined shipment
        const override = shipmentDateOverrides.get(combinedId)
        
        // Default dates: use overlap if valid, fallback to minimum allowed dates
        const defaultStart = overlapResult?.start ?? minimumDates.minStart ?? shipmentsToMerge[0].plannedShipStart
        const defaultEnd = overlapResult?.end ?? minimumDates.minEnd ?? shipmentsToMerge[0].plannedShipEnd

        combinedShipments.push({
          id: combinedId,
          collectionId: null, // Combined shipments have null collectionId
          collectionName: shipmentsToMerge.map((s) => s.collectionName).filter(Boolean).join(' + '),
          itemIds: mergedItems,
          plannedShipStart: override?.start ?? defaultStart,
          plannedShipEnd: override?.end ?? defaultEnd,
          // Use MINIMUM allowed dates (most restrictive) for constraints
          minAllowedStart: minimumDates.minStart ?? null,
          minAllowedEnd: minimumDates.minEnd ?? null,
          isCombined: true,
          originalShipmentIds: originalIds,
        })
      }

      finalShipments = [...ungroupedShipments, ...combinedShipments]
    }

    // PR-3b: Compute canCombineWith for each ungrouped shipment
    const shipmentsWithCombineInfo = finalShipments.map((shipment) => {
      // Don't compute for already combined shipments
      if (shipment.isCombined) return shipment

      const canCombineWith: string[] = []
      for (const other of finalShipments) {
        if (other.id === shipment.id) continue
        if (other.isCombined) continue // Can't combine with already combined

        // Check if windows overlap
        if (shipment.minAllowedStart && shipment.minAllowedEnd &&
            other.minAllowedStart && other.minAllowedEnd) {
          const overlap = getOverlapWindow(
            {
              id: shipment.collectionId ?? 0,
              name: shipment.collectionName ?? '',
              shipWindowStart: shipment.minAllowedStart,
              shipWindowEnd: shipment.minAllowedEnd,
            },
            {
              id: other.collectionId ?? 0,
              name: other.collectionName ?? '',
              shipWindowStart: other.minAllowedStart,
              shipWindowEnd: other.minAllowedEnd,
            }
          )
          if (overlap) {
            canCombineWith.push(other.id)
          }
        }
      }

      return { ...shipment, canCombineWith }
    })

    // Sort by ship start date
    return shipmentsWithCombineInfo.sort((a, b) =>
      a.plannedShipStart.localeCompare(b.plannedShipStart)
    )
  }, [cartItems, shipmentDateOverrides, isEditModeWithShipments, editModeShipments, shipmentGroups])

  const hasMultipleShipments = plannedShipments.length > 1

  // Validate all shipments for submit blocking
  // PR-3b: For combined shipments, validate against all items' collection windows
  const shipmentValidationErrors = useMemo(() => {
    const errors = new Map<string, { start?: string; end?: string }>()

    for (const shipment of plannedShipments) {
      let collections: CollectionWindow[] = []

      if (shipment.isCombined) {
        // PR-3b: Get all unique collection windows from items in this combined shipment
        const shipmentItems = cartItems.filter((item) =>
          shipment.itemIds.includes(item.sku)
        )
        const uniqueCollections = new Map<number, CollectionWindow>()
        for (const item of shipmentItems) {
          if (item.collectionId && item.shipWindowStart && item.shipWindowEnd) {
            if (!uniqueCollections.has(item.collectionId)) {
              uniqueCollections.set(item.collectionId, {
                id: item.collectionId,
                name: item.collectionName ?? 'Collection',
                shipWindowStart: item.shipWindowStart,
                shipWindowEnd: item.shipWindowEnd,
              })
            }
          }
        }
        collections = Array.from(uniqueCollections.values())
      } else {
        // Single collection shipment - use existing logic
        collections = shipment.minAllowedStart || shipment.minAllowedEnd
          ? [
              {
                id: shipment.collectionId ?? 0,
                name: shipment.collectionName ?? 'Collection',
                shipWindowStart: shipment.minAllowedStart,
                shipWindowEnd: shipment.minAllowedEnd,
              },
            ]
          : []
      }

      const result = validateShipDates(
        shipment.plannedShipStart,
        shipment.plannedShipEnd,
        collections
      )

      if (!result.valid) {
        const startError = result.errors.find((e) => e.field === 'start')
        const endError = result.errors.find((e) => e.field === 'end')
        if (startError || endError) {
          errors.set(shipment.id, {
            start: startError?.message,
            end: endError?.message,
          })
        }
      }
    }

    return errors
  }, [plannedShipments, cartItems])

  const hasShipmentValidationErrors = shipmentValidationErrors.size > 0

  // Detect items missing CollectionID - only block in Pre-Order mode
  // ATS items legitimately have null collectionId (they use default dates)
  const itemsMissingCollection = useMemo(() => {
    if (!isPreOrder) return [] // ATS items don't require collectionId
    return cartItems.filter(item => item.collectionId === null)
  }, [cartItems, isPreOrder])

  // Calculate totals
  const orderTotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  // Build query string for navigation (includes editOrder when in edit mode)
  const buildNavigationQuery = () => {
    const params = new URLSearchParams()
    if (repContext?.repId) {
      params.set('repId', repContext.repId)
    }
    if (returnTo !== '/buyer/select-journey') {
      params.set('returnTo', returnTo)
    }
    // Include editOrder param when in edit mode so we can return to editing
    if (editOrderId) {
      params.set('editOrder', editOrderId)
    }
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }
  const navigationQuery = buildNavigationQuery()

  // Clear stale edit state and notify user when order is no longer available
  useEffect(() => {
    if (shouldShowEditError) {
      toast.info('Your previous edit session has expired')
      clearEditMode()
    }
  }, [shouldShowEditError, clearEditMode])

  // Redirect to collections if cart is empty (only in non-edit mode)
  // Don't redirect while processing stale edit state
  useEffect(() => {
    if (!isEditMode && totalItems === 0 && !shouldShowEditError) {
      router.replace(`/buyer/select-journey${navigationQuery}`)
    }
  }, [totalItems, router, isEditMode, navigationQuery, shouldShowEditError])

  // Don't render form until we've checked cart (only in non-edit mode)
  // Also don't return null while clearing stale edit state
  if (!isEditMode && totalItems === 0 && !shouldShowEditError) {
    return null
  }

  // Show loading state while validating edit state on mount
  // This prevents flash of "Order Not Found" during validation
  if (isValidatingEditState) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded mx-auto mb-4"></div>
            <div className="h-4 w-64 bg-muted rounded mx-auto"></div>
          </div>
        </div>
      </div>
    )
  }

  // Show error when edit session is stale (state already cleared by effect above)
  if (shouldShowEditError) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Session Expired</h1>
          <p className="text-muted-foreground mb-4">
            The order you were editing is no longer available.
          </p>
          <Button onClick={() => router.push(returnTo)}>Continue Shopping</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
        {/* Draft recovery banner - only show when not in edit mode */}
        {/* Session recovery banner - only show when not in edit mode */}
        {!isEditMode && <SessionRecoveryBanner className="mb-4" />}

        <h1 className="text-2xl font-bold mb-4">
          {isEditMode ? `Edit Order ${existingOrder?.orderNumber}` : 'Review Your Order'}
        </h1>

      {/* Session backup toolbar - only show when not in edit mode */}
      {!isEditMode && <SessionBackupToolbar className="mb-6" />}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Order Summary - Right side on desktop */}
        <div className="lg:col-span-1 lg:order-2">
          <Card className="sticky top-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Order Summary</CardTitle>
              <CurrencyToggle size="sm" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {cartItems.length} item{cartItems.length !== 1 ? 's' : ''} in order
              </div>

              <div className="divide-y max-h-[400px] overflow-y-auto">
                {cartItems.map((item) => (
                  <div
                    key={item.sku}
                    className="py-3 flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.sku}
                      </div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.description}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const newQty = parseInt(e.target.value, 10)
                            if (!isNaN(newQty) && newQty > 0) {
                              setQuantity(item.productId, item.sku, newQty, item.price)
                            }
                          }}
                          className="w-16 h-7 text-center text-xs"
                        />
                        <span className="text-xs text-muted-foreground">
                          x {formatCurrency(item.price, effectiveCurrency)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {formatCurrency(item.price * item.quantity, effectiveCurrency)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeItem(item.productId, item.sku)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total ({effectiveCurrency})</span>
                  <span>{formatCurrency(orderTotal, effectiveCurrency)}</span>
                </div>
              </div>

              {/* Multiple shipments info - only shown when items have different ship windows */}
              {hasMultipleShipments && (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                    <strong>Multiple Shipments:</strong> Your order includes {plannedShipments.length} shipments with different delivery windows.
                  </div>
                  <ShipmentTimeline
                    shipments={plannedShipments.map((s) => ({
                      id: s.id,
                      collectionName: s.collectionName,
                      plannedShipStart: s.plannedShipStart,
                      plannedShipEnd: s.plannedShipEnd,
                      itemCount: s.itemIds.length,
                      // Add items for expanded view
                      items: s.itemIds.map((sku) => {
                        const item = cartItems.find((ci) => ci.sku === sku)
                        return {
                          sku,
                          description: item?.description,
                          quantity: item?.quantity ?? 1,
                        }
                      }),
                    }))}
                    variant="full"
                  />
                </div>
              )}

              {/* Continue Shopping - available in both modes */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push((isPreOrder ? '/buyer/pre-order' : '/buyer/ats') + navigationQuery)}
              >
                {isEditMode ? 'Add More Items' : 'Continue Shopping'}
              </Button>

              {/* Cancel Edit - only in edit mode */}
              {isEditMode && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    clearEditMode()
                    router.push(returnTo)
                  }}
                >
                  Cancel Edit
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Customer Form - Left side on desktop */}
        <div className="lg:col-span-2 lg:order-1">
          <OrderForm
            currency={effectiveCurrency}
            reps={reps}
            cartItems={cartItems}
            isPreOrder={isPreOrder}
            editMode={isEditMode}
            existingOrder={existingOrder}
            returnTo={returnTo}
            repContext={repContext}
            repName={repName}
            itemsMissingCollection={itemsMissingCollection}
            plannedShipments={plannedShipments}
            onShipmentDatesChange={updateShipmentDates}
            shipmentValidationErrors={shipmentValidationErrors}
            hasShipmentValidationErrors={hasShipmentValidationErrors}
            // PR-3b: Combine/split handlers
            onCombineShipments={combineShipments}
            onSplitShipment={splitShipment}
          />
        </div>
      </div>
    </div>
  )
}
