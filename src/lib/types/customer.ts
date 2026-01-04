/**
 * Address structure for customer billing/shipping.
 */
export interface CustomerAddress {
  street1: string | null
  street2: string | null
  city: string | null
  stateProvince: string | null
  zipPostal: string | null
  country: string | null
}

/**
 * Customer from Customers table.
 * Note: Customers.Rep is a STRING (rep name), not a foreign key.
 */
export interface Customer {
  id: number // Customers.ID (Int)
  storeName: string // Customers.StoreName
  email: string | null // Customers.Email
  customerName: string | null // Customers.CustomerName (contact name)
  phone: string | null // Customers.Phone
  rep: string | null // Customers.Rep - STRING (rep name), NOT a FK
  address: CustomerAddress // Billing address
  shippingAddress: CustomerAddress // Shipping address
  website: string | null // Customers.Website
  additionalInfo: string | null // Customers.AdditionalInfo
}

export interface CustomersListResult {
  customers: Customer[]
  total: number
}

/**
 * Input type for creating/updating customers.
 * Matches Prisma schema fields.
 */
export interface CustomerInput {
  storeName: string
  email?: string | null
  customerName?: string | null
  phone?: string | null
  rep?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  stateProvince?: string | null
  zipPostal?: string | null
  country?: string | null
  shippingStreet1?: string | null
  shippingStreet2?: string | null
  shippingCity?: string | null
  shippingStateProvince?: string | null
  shippingZipPostal?: string | null
  shippingCountry?: string | null
  website?: string | null
  additionalInfo?: string | null
}
