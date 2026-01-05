'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOrder } from '@/lib/contexts/order-context'
import { orderFormSchema, type OrderFormData } from '@/lib/schemas/order'
import { createOrder, updateOrder } from '@/lib/data/actions/orders'
import {
  suggestStoreNames,
  getCustomerForAutoFill,
  type StoreSuggestion,
} from '@/lib/data/actions/customers'
import { findRepByCustomerCode } from '@/lib/utils/rep-matching'
import {
  normalizeStateProvince,
  normalizeCountry,
  normalizeWebsite,
} from '@/lib/utils/form-normalization'
import { formatCurrency } from '@/lib/utils'
import { isValidReturnTo, isRepPortalReturn } from '@/lib/utils/rep-context'
import type { Currency } from '@/lib/types'
import type { OrderForEditing } from '@/lib/data/queries/orders'

interface OrderFormProps {
  currency: Currency
  reps: Array<{ id: string; name: string; code: string }>
  cartItems: Array<{
    sku: string
    skuVariantId: number
    quantity: number
    price: number
    description?: string
  }>
  isPreOrder?: boolean
  editMode?: boolean
  existingOrder?: OrderForEditing | null
  returnTo?: string
  repContext?: { repId: string } | null
}

// Helper to format date as YYYY-MM-DD for input[type="date"]
function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Format ISO date string to display format
function formatDisplayDate(isoDate: string | null): string {
  if (!isoDate) return 'TBD'
  const date = new Date(isoDate)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function OrderForm({
  currency,
  reps,
  cartItems,
  isPreOrder = false,
  editMode = false,
  existingOrder = null,
  returnTo = '/buyer/select-journey',
  repContext = null,
}: OrderFormProps) {
  const router = useRouter()
  const { clearAll, getPreOrderShipWindow } = useOrder()
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Store autocomplete state
  const [storeSuggestions, setStoreSuggestions] = useState<StoreSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const storeInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLUListElement>(null)

  // Customer selection state
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [isRepLocked, setIsRepLocked] = useState(false)

  // Get pre-order ship window from cart metadata (if available)
  const preOrderWindow = isPreOrder ? getPreOrderShipWindow() : null

  // Default ship dates:
  // - For edit mode: use existing order dates
  // - For pre-orders: use category on-route dates if available
  // - For ATS: today and today + 14 days
  const today = new Date()
  const twoWeeksFromNow = new Date(today)
  twoWeeksFromNow.setDate(today.getDate() + 14)

  const defaultStartDate = editMode && existingOrder
    ? existingOrder.shipStartDate
    : preOrderWindow?.start
      ? preOrderWindow.start.split('T')[0]
      : formatDateForInput(today)
  const defaultEndDate = editMode && existingOrder
    ? existingOrder.shipEndDate
    : preOrderWindow?.end
      ? preOrderWindow.end.split('T')[0]
      : formatDateForInput(twoWeeksFromNow)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: editMode && existingOrder
      ? {
          storeName: existingOrder.storeName,
          buyerName: existingOrder.buyerName,
          salesRepId: existingOrder.salesRepId || '',
          customerPhone: existingOrder.customerPhone,
          customerEmail: existingOrder.customerEmail,
          website: existingOrder.website || '',
          // For edit mode, use placeholder values for address (will be skipped)
          street1: 'N/A',
          city: 'N/A',
          stateProvince: 'N/A',
          zipPostal: 'N/A',
          country: 'USA',
          shippingStreet1: 'N/A',
          shippingCity: 'N/A',
          shippingStateProvince: 'N/A',
          shippingZipPostal: 'N/A',
          shippingCountry: 'USA',
          shipStartDate: existingOrder.shipStartDate,
          shipEndDate: existingOrder.shipEndDate,
          customerPO: existingOrder.customerPO || '',
          orderNotes: existingOrder.orderNotes || '',
        }
      : {
          country: 'USA',
          shippingCountry: 'USA',
          shipStartDate: defaultStartDate,
          shipEndDate: defaultEndDate,
        },
  })

  // Watch store name for autocomplete
  const storeNameValue = watch('storeName')

  // Set initial salesRepId for edit mode (Select component doesn't read from defaultValues well)
  useEffect(() => {
    if (editMode && existingOrder?.salesRepId) {
      setValue('salesRepId', existingOrder.salesRepId)
    }
  }, [editMode, existingOrder, setValue])

  // Lock rep dropdown when rep context is present (rep creating order)
  useEffect(() => {
    if (repContext?.repId) {
      setValue('salesRepId', repContext.repId)
      setIsRepLocked(true)
    }
  }, [repContext, setValue])

  // Debounced store name search (only for new orders)
  useEffect(() => {
    if (editMode) return // No autocomplete in edit mode

    const timeoutId = setTimeout(async () => {
      if (storeNameValue && storeNameValue.length >= 3) {
        setIsLoadingSuggestions(true)
        try {
          const suggestions = await suggestStoreNames(storeNameValue)
          setStoreSuggestions(suggestions)
          setShowSuggestions(suggestions.length > 0)
        } catch {
          setStoreSuggestions([])
        }
        setIsLoadingSuggestions(false)
      } else {
        setStoreSuggestions([])
        setShowSuggestions(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [storeNameValue, editMode])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        storeInputRef.current &&
        !storeInputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle customer selection from autocomplete
  const handleSelectCustomer = useCallback(async (suggestion: StoreSuggestion) => {
    setShowSuggestions(false)
    setValue('storeName', suggestion.storeName)
    setSelectedCustomerId(suggestion.id)

    // Fetch full customer data for auto-fill
    const customer = await getCustomerForAutoFill(suggestion.id)
    if (!customer) return

    // Auto-fill customer fields with normalization
    if (customer.buyerName) setValue('buyerName', customer.buyerName)
    if (customer.email) setValue('customerEmail', customer.email)
    if (customer.phone) setValue('customerPhone', customer.phone)
    setValue('website', normalizeWebsite(customer.website))

    // Auto-fill billing address (only for new orders, but we're always in new order mode for autocomplete)
    if (customer.street1) setValue('street1', customer.street1)
    if (customer.street2) setValue('street2', customer.street2)
    if (customer.city) setValue('city', customer.city)
    setValue('stateProvince', normalizeStateProvince(customer.stateProvince))
    if (customer.zipPostal) setValue('zipPostal', customer.zipPostal)
    setValue('country', normalizeCountry(customer.country))

    // Auto-fill shipping address
    if (customer.shippingStreet1) setValue('shippingStreet1', customer.shippingStreet1)
    if (customer.shippingStreet2) setValue('shippingStreet2', customer.shippingStreet2)
    if (customer.shippingCity) setValue('shippingCity', customer.shippingCity)
    setValue('shippingStateProvince', normalizeStateProvince(customer.shippingStateProvince))
    if (customer.shippingZipPostal) setValue('shippingZipPostal', customer.shippingZipPostal)
    setValue('shippingCountry', normalizeCountry(customer.shippingCountry))

    // Auto-select and lock rep based on customer's rep code
    // (Only if not in rep context - rep context takes priority)
    if (!repContext?.repId && customer.rep) {
      const matchedRep = findRepByCustomerCode(customer.rep, reps)
      if (matchedRep) {
        setValue('salesRepId', matchedRep.id)
        setIsRepLocked(true)
      }
    }
  }, [setValue, reps, repContext])

  // Handle store name change - reset customer selection if user types new name
  const handleStoreNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    // If the value changes from a selected customer, reset customer state
    const currentSuggestion = storeSuggestions.find(s => s.storeName === newValue)
    if (!currentSuggestion) {
      setSelectedCustomerId(null)
      // Only unlock rep if not in rep context (rep context keeps rep locked)
      if (!repContext?.repId) {
        setIsRepLocked(false)
      }
    }
  }, [storeSuggestions, repContext])

  // Watch billing address for "copy to shipping" functionality
  const billingStreet1 = watch('street1')
  const billingStreet2 = watch('street2')
  const billingCity = watch('city')
  const billingStateProvince = watch('stateProvince')
  const billingZipPostal = watch('zipPostal')
  const billingCountry = watch('country')

  const copyBillingToShipping = () => {
    setValue('shippingStreet1', billingStreet1 || '')
    setValue('shippingStreet2', billingStreet2 || '')
    setValue('shippingCity', billingCity || '')
    setValue('shippingStateProvince', billingStateProvince || '')
    setValue('shippingZipPostal', billingZipPostal || '')
    setValue('shippingCountry', billingCountry || 'USA')
  }

  const onSubmit = async (data: OrderFormData) => {
    if (isSubmitting) return // Prevent double-click
    setIsSubmitting(true)

    startTransition(async () => {
      try {
        if (editMode && existingOrder) {
          // Update existing order
          const result = await updateOrder({
            orderId: existingOrder.id,
            storeName: data.storeName,
            buyerName: data.buyerName,
            salesRepId: data.salesRepId,
            customerEmail: data.customerEmail,
            customerPhone: data.customerPhone,
            currency,
            shipStartDate: data.shipStartDate,
            shipEndDate: data.shipEndDate,
            orderNotes: data.orderNotes,
            customerPO: data.customerPO,
            website: data.website,
            items: cartItems.map((item) => ({
              sku: item.sku,
              skuVariantId: item.skuVariantId,
              quantity: item.quantity,
              price: item.price,
            })),
          })

          if (result.success) {
            toast.success(`Order ${result.orderNumber} updated successfully!`)
            router.push(returnTo)
          } else {
            toast.error(result.error || 'Failed to update order')
            setIsSubmitting(false)
          }
        } else {
          // Create new order with customerId for strong ownership
          const result = await createOrder({
            ...data,
            currency,
            items: cartItems.map((item) => ({
              sku: item.sku,
              skuVariantId: item.skuVariantId,
              quantity: item.quantity,
              price: item.price,
            })),
            isPreOrder, // P prefix for pre-orders, A prefix for ATS
            customerId: selectedCustomerId, // Pass selected customer ID for strong ownership
          })

          if (result.success && result.orderId) {
            clearAll() // Clear cart
            toast.success(`Order ${result.orderNumber} created successfully!`)
            
            // For rep-created orders, redirect back to rep portal if returnTo is valid
            if (isRepPortalReturn(returnTo)) {
              router.push(returnTo)
            } else {
              router.push(`/buyer/confirmation/${result.orderId}`)
            }
          } else {
            toast.error(result.error || 'Failed to create order')
            setIsSubmitting(false)
          }
        }
      } catch (error) {
        toast.error('An unexpected error occurred')
        setIsSubmitting(false)
      }
    })
  }

  // Calculate order total
  const orderTotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Customer Information */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 relative">
              <Label htmlFor="storeName">Store Name *</Label>
              <Input
                id="storeName"
                {...register('storeName', {
                  onChange: handleStoreNameChange,
                })}
                ref={(e) => {
                  register('storeName').ref(e)
                  storeInputRef.current = e
                }}
                placeholder="Enter store name"
                autoComplete="off"
              />
              {/* Autocomplete dropdown - only shown for new orders */}
              {!editMode && showSuggestions && storeSuggestions.length > 0 && (
                <ul
                  ref={suggestionsRef}
                  className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
                >
                  {storeSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.id}
                      className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handleSelectCustomer(suggestion)}
                    >
                      {suggestion.storeName}
                    </li>
                  ))}
                </ul>
              )}
              {!editMode && isLoadingSuggestions && (
                <div className="absolute right-3 top-9">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
              {errors.storeName && (
                <p className="text-sm text-destructive">{errors.storeName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyerName">Buyer Name *</Label>
              <Input
                id="buyerName"
                {...register('buyerName')}
                placeholder="Contact name"
              />
              {errors.buyerName && (
                <p className="text-sm text-destructive">{errors.buyerName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="salesRepId">
                Sales Rep *
                {isRepLocked && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (Auto-assigned based on customer)
                  </span>
                )}
              </Label>
              <Select
                value={watch('salesRepId')}
                onValueChange={(value) => {
                  if (!isRepLocked) {
                    setValue('salesRepId', value)
                  }
                }}
                disabled={isRepLocked}
              >
                <SelectTrigger className={`w-full ${isRepLocked ? 'opacity-70' : ''}`}>
                  <SelectValue placeholder="Select a rep" />
                </SelectTrigger>
                <SelectContent>
                  {reps.map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.salesRepId && (
                <p className="text-sm text-destructive">{errors.salesRepId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone *</Label>
              <Input
                id="customerPhone"
                type="tel"
                {...register('customerPhone')}
                placeholder="(555) 555-5555"
              />
              {errors.customerPhone && (
                <p className="text-sm text-destructive">{errors.customerPhone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email *</Label>
              <Input
                id="customerEmail"
                type="email"
                {...register('customerEmail')}
                placeholder="buyer@store.com"
              />
              {errors.customerEmail && (
                <p className="text-sm text-destructive">{errors.customerEmail.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                {...register('website')}
                placeholder="https://store.com"
              />
              {errors.website && (
                <p className="text-sm text-destructive">{errors.website.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Billing Address - Only show for new orders */}
      {!editMode && (
        <Card>
          <CardHeader>
            <CardTitle>Billing Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="street1">Street Address *</Label>
                <Input
                  id="street1"
                  {...register('street1')}
                  placeholder="123 Main St"
                />
                {errors.street1 && (
                  <p className="text-sm text-destructive">{errors.street1.message}</p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="street2">Street Address 2</Label>
                <Input
                  id="street2"
                  {...register('street2')}
                  placeholder="Suite 100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input id="city" {...register('city')} placeholder="City" />
                {errors.city && (
                  <p className="text-sm text-destructive">{errors.city.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="stateProvince">State/Province *</Label>
                <Input
                  id="stateProvince"
                  {...register('stateProvince')}
                  placeholder="CA"
                  maxLength={3}
                />
                {errors.stateProvince && (
                  <p className="text-sm text-destructive">{errors.stateProvince.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="zipPostal">Zip/Postal Code *</Label>
                <Input
                  id="zipPostal"
                  {...register('zipPostal')}
                  placeholder="12345"
                />
                {errors.zipPostal && (
                  <p className="text-sm text-destructive">{errors.zipPostal.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country *</Label>
                <Select
                  value={watch('country')}
                  onValueChange={(value) => setValue('country', value as 'USA' | 'Canada')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USA">USA</SelectItem>
                    <SelectItem value="Canada">Canada</SelectItem>
                  </SelectContent>
                </Select>
                {errors.country && (
                  <p className="text-sm text-destructive">{errors.country.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shipping Address - Only show for new orders */}
      {!editMode && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Shipping Address</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyBillingToShipping}
            >
              Copy from Billing
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="shippingStreet1">Street Address *</Label>
                <Input
                  id="shippingStreet1"
                  {...register('shippingStreet1')}
                  placeholder="123 Main St"
                />
                {errors.shippingStreet1 && (
                  <p className="text-sm text-destructive">{errors.shippingStreet1.message}</p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="shippingStreet2">Street Address 2</Label>
                <Input
                  id="shippingStreet2"
                  {...register('shippingStreet2')}
                  placeholder="Suite 100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingCity">City *</Label>
                <Input
                  id="shippingCity"
                  {...register('shippingCity')}
                  placeholder="City"
                />
                {errors.shippingCity && (
                  <p className="text-sm text-destructive">{errors.shippingCity.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingStateProvince">State/Province *</Label>
                <Input
                  id="shippingStateProvince"
                  {...register('shippingStateProvince')}
                  placeholder="CA"
                  maxLength={3}
                />
                {errors.shippingStateProvince && (
                  <p className="text-sm text-destructive">{errors.shippingStateProvince.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingZipPostal">Zip/Postal Code *</Label>
                <Input
                  id="shippingZipPostal"
                  {...register('shippingZipPostal')}
                  placeholder="12345"
                />
                {errors.shippingZipPostal && (
                  <p className="text-sm text-destructive">{errors.shippingZipPostal.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingCountry">Country *</Label>
                <Select
                  value={watch('shippingCountry')}
                  onValueChange={(value) => setValue('shippingCountry', value as 'USA' | 'Canada')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USA">USA</SelectItem>
                    <SelectItem value="Canada">Canada</SelectItem>
                  </SelectContent>
                </Select>
                {errors.shippingCountry && (
                  <p className="text-sm text-destructive">{errors.shippingCountry.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-Order Info Banner */}
      {isPreOrder && preOrderWindow && !editMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-foreground">Pre-Order</p>
                <p className="text-sm text-muted-foreground">
                  Category ships: {formatDisplayDate(preOrderWindow.start)} - {formatDisplayDate(preOrderWindow.end)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can adjust your requested ship window below.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Details */}
      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shipStartDate">Ship Start Date *</Label>
              <Input
                id="shipStartDate"
                type="date"
                {...register('shipStartDate')}
              />
              {errors.shipStartDate && (
                <p className="text-sm text-destructive">{errors.shipStartDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="shipEndDate">Ship End Date *</Label>
              <Input
                id="shipEndDate"
                type="date"
                {...register('shipEndDate')}
              />
              {errors.shipEndDate && (
                <p className="text-sm text-destructive">{errors.shipEndDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerPO">Customer PO</Label>
              <Input
                id="customerPO"
                {...register('customerPO')}
                placeholder="PO Number (optional)"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="orderNotes">Order Notes</Label>
              <textarea
                id="orderNotes"
                {...register('orderNotes')}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Payment terms, special instructions..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-lg font-semibold">
              Order Total: {formatCurrency(orderTotal, currency)}
            </div>
            <div className="flex gap-2">
              {editMode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(returnTo)}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={isPending || isSubmitting}
                className="w-full sm:w-auto"
              >
                {isPending || isSubmitting
                  ? (editMode ? 'Updating...' : 'Submitting...')
                  : (editMode ? 'Update Order' : 'Submit Order')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
