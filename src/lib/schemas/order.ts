/**
 * Order form validation schema
 * Matches .NET MyOrder.aspx customer info requirements
 */
import { z } from 'zod'

export const orderFormSchema = z.object({
  // Customer info
  storeName: z.string().min(1, 'Store name is required'),
  buyerName: z.string().min(1, 'Buyer name is required'),
  salesRepId: z.string().min(1, 'Sales rep is required'),
  customerPhone: z.string().min(1, 'Phone is required'),
  customerEmail: z.string().email('Valid email required'),
  website: z.string().url('Must be a valid URL').optional().or(z.literal('')),

  // Billing address
  street1: z.string().min(1, 'Address is required'),
  street2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  stateProvince: z.string().min(1, 'State/Province is required').max(3, 'Max 3 characters'),
  zipPostal: z.string().min(1, 'Zip/Postal code is required'),
  country: z.enum(['USA', 'Canada'], { message: 'Select a country' }),

  // Shipping address (same structure)
  shippingStreet1: z.string().min(1, 'Shipping address is required'),
  shippingStreet2: z.string().optional(),
  shippingCity: z.string().min(1, 'Shipping city is required'),
  shippingStateProvince: z.string().min(1, 'Shipping state/province is required').max(3, 'Max 3 characters'),
  shippingZipPostal: z.string().min(1, 'Shipping zip/postal is required'),
  shippingCountry: z.enum(['USA', 'Canada'], { message: 'Select a country' }),

  // Order details
  shipStartDate: z.string().min(1, 'Ship start date is required'),
  shipEndDate: z.string().min(1, 'Ship end date is required'),
  customerPO: z.string().optional(),
  orderNotes: z.string().optional(),
}).refine(
  (data) => {
    // Validate ship end date is after start date
    if (data.shipStartDate && data.shipEndDate) {
      return new Date(data.shipEndDate) >= new Date(data.shipStartDate)
    }
    return true
  },
  {
    message: 'Ship end date must be on or after start date',
    path: ['shipEndDate'],
  }
)

export type OrderFormData = z.infer<typeof orderFormSchema>

/**
 * Schema for cart items passed to createOrder
 * Uses Collection for order splitting by delivery date
 */
export const orderItemSchema = z.object({
  sku: z.string().min(1),
  skuVariantId: z.union([z.bigint(), z.number()]),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
  // Collection is the source for order splitting and pre-order detection
  collectionId: z.number().nullable().optional(),
  collectionName: z.string().nullable().optional(),
  // Ship window dates from Collection
  shipWindowStart: z.string().nullable().optional(),
  shipWindowEnd: z.string().nullable().optional(),
})

export type OrderItem = z.infer<typeof orderItemSchema>

/**
 * Planned shipment data for order submission.
 * Each shipment has its own ship window dates validated against collection constraints.
 */
export const plannedShipmentSchema = z.object({
  id: z.string(),
  collectionId: z.number().nullable(),
  collectionName: z.string().nullable(),
  itemSkus: z.array(z.string()),
  plannedShipStart: z.string().min(1, 'Ship start date is required'),
  plannedShipEnd: z.string().min(1, 'Ship end date is required'),
})

export type PlannedShipmentData = z.infer<typeof plannedShipmentSchema>

/**
 * Full order creation input schema
 */
export const createOrderInputSchema = orderFormSchema.extend({
  currency: z.enum(['USD', 'CAD']),
  items: z.array(orderItemSchema).min(1, 'Order must have at least one item'),
  // isPreOrder is now derived from SKU data on the server.
  // Kept optional for backwards compatibility but ignored by server.
  isPreOrder: z.boolean().optional(),
  // Optional customer ID for existing customer - enables strong ownership on order
  // Nullable to handle client state sending null for new stores
  customerId: z.number().int().positive().nullable().optional(),
  // Skip automatic email sending - emails will be sent via confirmation popup
  skipEmail: z.boolean().optional(),
  // Planned shipments array - each shipment has its own ship window dates
  // Optional for backward compatibility with existing orders
  plannedShipments: z.array(plannedShipmentSchema).optional(),
})

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>
