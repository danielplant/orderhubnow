'use client'

import { useState, useEffect, useTransition } from 'react'
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
import { createOrder } from '@/lib/data/actions/orders'
import { formatCurrency } from '@/lib/utils'
import type { Currency } from '@/lib/types'

interface OrderFormProps {
  currency: Currency
  reps: Array<{ id: string; name: string }>
  cartItems: Array<{
    sku: string
    skuVariantId: number
    quantity: number
    price: number
    description?: string
  }>
}

// Helper to format date as YYYY-MM-DD for input[type="date"]
function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function OrderForm({ currency, reps, cartItems }: OrderFormProps) {
  const router = useRouter()
  const { clearAll } = useOrder()
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Default ship dates: today and today + 14 days
  const today = new Date()
  const twoWeeksFromNow = new Date(today)
  twoWeeksFromNow.setDate(today.getDate() + 14)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      country: 'USA',
      shippingCountry: 'USA',
      shipStartDate: formatDateForInput(today),
      shipEndDate: formatDateForInput(twoWeeksFromNow),
    },
  })

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
        const result = await createOrder({
          ...data,
          currency,
          items: cartItems.map((item) => ({
            sku: item.sku,
            skuVariantId: item.skuVariantId,
            quantity: item.quantity,
            price: item.price,
          })),
          isPreOrder: false, // ATS orders for now
        })

        if (result.success && result.orderId) {
          clearAll() // Clear cart
          toast.success(`Order ${result.orderNumber} created successfully!`)
          router.push(`/buyer/confirmation/${result.orderId}`)
        } else {
          toast.error(result.error || 'Failed to create order')
          setIsSubmitting(false)
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
            <div className="space-y-2">
              <Label htmlFor="storeName">Store Name *</Label>
              <Input
                id="storeName"
                {...register('storeName')}
                placeholder="Enter store name"
              />
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
              <Label htmlFor="salesRep">Sales Rep *</Label>
              <Select onValueChange={(value) => setValue('salesRep', value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a rep" />
                </SelectTrigger>
                <SelectContent>
                  {reps.map((rep) => (
                    <SelectItem key={rep.id} value={rep.name}>
                      {rep.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.salesRep && (
                <p className="text-sm text-destructive">{errors.salesRep.message}</p>
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

      {/* Billing Address */}
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
                defaultValue="USA"
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

      {/* Shipping Address */}
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
                defaultValue="USA"
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
            <Button
              type="submit"
              size="lg"
              disabled={isPending || isSubmitting}
              className="w-full sm:w-auto"
            >
              {isPending || isSubmitting ? 'Submitting...' : 'Submit Order'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
