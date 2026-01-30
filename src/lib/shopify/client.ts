/**
 * Shopify Admin API Client
 * 
 * Wraps the Shopify Admin REST API with typed methods.
 * Credentials are read from environment variables:
 * - SHOPIFY_STORE_DOMAIN (e.g., limeappleonline.myshopify.com)
 * - SHOPIFY_ACCESS_TOKEN (Admin API access token)
 * - SHOPIFY_API_VERSION (e.g., 2024-01)
 */

// ============================================================================
// Types
// ============================================================================

export interface ShopifyConfig {
  storeDomain: string
  accessToken: string
  apiVersion: string
}

export interface ShopifyAddress {
  address1?: string
  address2?: string
  city?: string
  province?: string
  province_code?: string
  country?: string
  country_code?: string
  zip?: string
  phone?: string
  name?: string
  company?: string
  customer_id?: number
}

export interface ShopifyLineItem {
  variant_id: number
  quantity: number
  price: string
  name?: string
  title?: string
  requires_shipping?: boolean
  grams?: number
}

export interface ShopifyNoteAttribute {
  name: string
  value: string
}

export interface ShopifyCustomer {
  id?: number
  email: string
  first_name?: string
  last_name?: string
  tags?: string
}

export interface ShopifyOrderRequest {
  order: {
    name?: string
    note?: string
    tags?: string
    financial_status?: string
    inventory_behaviour?: string
    customer?: ShopifyCustomer
    billing_address?: ShopifyAddress
    shipping_address?: ShopifyAddress
    line_items: ShopifyLineItem[]
    note_attributes?: ShopifyNoteAttribute[]
    use_customer_default_address?: boolean
  }
}

export interface ShopifyOrderLineItem {
  id: number
  variant_id: number
  sku: string
  quantity: number
  price: string
  title?: string
  name?: string
}

export interface ShopifyOrderResponse {
  order?: {
    id: number
    order_number: number
    name: string
    line_items?: ShopifyOrderLineItem[]
  }
  errors?: Record<string, string[]> | string
}

export interface ShopifyCustomerRequest {
  customer: ShopifyCustomer
}

export interface ShopifyCustomerResponse {
  customer?: {
    id: number
    email: string
    first_name?: string
    last_name?: string
  }
  errors?: Record<string, string[]> | string
}

// ============================================================================
// Configuration
// ============================================================================

function getConfig(): ShopifyConfig {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

  if (!storeDomain) {
    throw new Error('SHOPIFY_STORE_DOMAIN environment variable is not set')
  }
  if (!accessToken) {
    throw new Error('SHOPIFY_ACCESS_TOKEN environment variable is not set')
  }

  return { storeDomain, accessToken, apiVersion }
}

export function isShopifyConfigured(): boolean {
  return !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN)
}

// ============================================================================
// HTTP Client
// ============================================================================

async function shopifyFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error?: string; status: number }> {
  const config = getConfig()
  const baseUrl = `https://${config.storeDomain}/admin/api/${config.apiVersion}`
  const url = `${baseUrl}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.accessToken,
      ...options.headers,
    },
  })

  const text = await response.text()
  let data: T | null = null
  
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Response was not JSON
  }

  if (!response.ok) {
    const errorMessage = typeof data === 'object' && data !== null && 'errors' in data
      ? JSON.stringify((data as { errors: unknown }).errors)
      : text || `HTTP ${response.status}`
    return { data: null, error: errorMessage, status: response.status }
  }

  return { data, status: response.status }
}

// ============================================================================
// GraphQL API
// ============================================================================

/**
 * Execute a GraphQL query against Shopify Admin API.
 * Used for schema introspection and query validation.
 */
export async function shopifyGraphQLFetch(
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data?: unknown; error?: string }> {
  const config = getConfig()
  const url = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const data = await response.json()
    return { data }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// ============================================================================
// Orders API
// ============================================================================

/**
 * Order details returned from Shopify GET /orders/{id}.json
 */
export interface ShopifyOrderDetails {
  id: number
  name: string
  order_number: number
  financial_status: string | null
  fulfillment_status: string | null
  cancelled_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Get a single order from Shopify by ID.
 * Used for syncing order status back to OHN.
 */
export async function getOrder(
  orderId: string
): Promise<{ order?: ShopifyOrderDetails; error?: string }> {
  const { data, error } = await shopifyFetch<{ order: ShopifyOrderDetails }>(
    `/orders/${orderId}.json?fields=id,name,order_number,financial_status,fulfillment_status,cancelled_at,closed_at,created_at,updated_at`
  )

  if (error) {
    return { error }
  }

  return { order: data?.order }
}

export async function createOrder(
  orderData: ShopifyOrderRequest
): Promise<{ order?: ShopifyOrderResponse['order']; error?: string }> {
  const { data, error, status } = await shopifyFetch<ShopifyOrderResponse>(
    '/orders.json',
    {
      method: 'POST',
      body: JSON.stringify(orderData),
    }
  )

  if (error) {
    // Check if error is customer not found
    if (status === 422 && error.includes('customer') && error.includes('not found')) {
      return { error: 'CUSTOMER_NOT_FOUND' }
    }
    return { error }
  }

  return { order: data?.order }
}

// ============================================================================
// Customers API
// ============================================================================

export async function createCustomer(
  customerData: ShopifyCustomerRequest
): Promise<{ customer?: ShopifyCustomerResponse['customer']; error?: string }> {
  const { data, error } = await shopifyFetch<ShopifyCustomerResponse>(
    '/customers.json',
    {
      method: 'POST',
      body: JSON.stringify(customerData),
    }
  )

  if (error) {
    return { error }
  }

  return { customer: data?.customer }
}

export async function findCustomerByEmail(
  email: string
): Promise<{ customer?: ShopifyCustomerResponse['customer']; error?: string }> {
  const { data, error } = await shopifyFetch<{ customers: ShopifyCustomerResponse['customer'][] }>(
    `/customers/search.json?query=email:${encodeURIComponent(email)}`
  )

  if (error) {
    return { error }
  }

  const customer = data?.customers?.[0]
  return { customer }
}

/**
 * Get a customer by ID from Shopify.
 */
export async function getCustomer(
  customerId: number
): Promise<{ customer?: ShopifyCustomerResponse['customer']; error?: string }> {
  const { data, error } = await shopifyFetch<ShopifyCustomerResponse>(
    `/customers/${customerId}.json`
  )
  if (error) return { error }
  return { customer: data?.customer }
}

/**
 * Update a customer in Shopify.
 */
export async function updateCustomer(
  customerId: number,
  customerData: Partial<ShopifyCustomer>
): Promise<{ customer?: ShopifyCustomerResponse['customer']; error?: string }> {
  const { data, error } = await shopifyFetch<ShopifyCustomerResponse>(
    `/customers/${customerId}.json`,
    {
      method: 'PUT',
      body: JSON.stringify({ customer: customerData }),
    }
  )
  if (error) return { error }
  return { customer: data?.customer }
}

// ============================================================================
// Customer List API (for bulk import)
// ============================================================================

export interface ShopifyCustomerFull {
  id: number
  email: string
  first_name?: string
  last_name?: string
  phone?: string
  default_address?: {
    address1?: string
    address2?: string
    city?: string
    province?: string
    province_code?: string
    country?: string
    country_code?: string
    zip?: string
    company?: string
  }
  addresses?: Array<{
    id: number
    address1?: string
    address2?: string
    city?: string
    province?: string
    province_code?: string
    country?: string
    country_code?: string
    zip?: string
    company?: string
  }>
  tags?: string
  note?: string
  created_at?: string
  updated_at?: string
}

export interface ShopifyCustomersListResponse {
  customers: ShopifyCustomerFull[]
}

/**
 * Fetch a page of customers from Shopify.
 * Uses cursor-based pagination via page_info.
 */
export async function listCustomers(
  limit = 250,
  pageInfo?: string
): Promise<{
  customers: ShopifyCustomerFull[]
  nextPageInfo?: string
  error?: string
}> {
  let endpoint = `/customers.json?limit=${limit}`
  if (pageInfo) {
    endpoint = `/customers.json?limit=${limit}&page_info=${pageInfo}`
  }

  const { data, error } = await shopifyFetch<ShopifyCustomersListResponse>(endpoint)

  if (error) {
    return { customers: [], error }
  }

  // Note: For proper pagination, we'd need to parse the Link header
  // For now, we'll rely on the caller to handle pagination by checking if we got the full limit
  return {
    customers: data?.customers ?? [],
    // If we received a full page, there might be more
    nextPageInfo: data?.customers?.length === limit ? 'more' : undefined,
  }
}

/**
 * Fetch ALL customers from Shopify by iterating through pages.
 * Calls the onProgress callback with intermediate results.
 */
export async function listAllCustomers(
  onProgress?: (processed: number, customers: ShopifyCustomerFull[]) => void
): Promise<{
  customers: ShopifyCustomerFull[]
  error?: string
}> {
  const allCustomers: ShopifyCustomerFull[] = []
  let hasMore = true
  let sinceId = 0

  while (hasMore) {
    const endpoint = sinceId > 0
      ? `/customers.json?limit=250&since_id=${sinceId}`
      : '/customers.json?limit=250'

    const { data, error } = await shopifyFetch<ShopifyCustomersListResponse>(endpoint)

    if (error) {
      return { customers: allCustomers, error }
    }

    const customers = data?.customers ?? []
    allCustomers.push(...customers)

    if (onProgress) {
      onProgress(allCustomers.length, customers)
    }

    if (customers.length < 250) {
      hasMore = false
    } else {
      // Get the last ID for pagination
      sinceId = customers[customers.length - 1].id
    }
  }

  return { customers: allCustomers }
}

// ============================================================================
// Fulfillments API
// ============================================================================

export interface ShopifyFulfillmentLineItem {
  id: number
  quantity?: number
}

export interface ShopifyFulfillmentRequest {
  fulfillment: {
    location_id?: number
    tracking_number?: string
    tracking_url?: string
    tracking_company?: string
    line_items?: ShopifyFulfillmentLineItem[]
    notify_customer?: boolean
  }
}

export interface ShopifyFulfillmentResponse {
  fulfillment?: {
    id: number
    order_id: number
    status: string
    tracking_company?: string
    tracking_number?: string
    tracking_url?: string
  }
  errors?: Record<string, string[]> | string
}

/**
 * Detailed fulfillment data returned when fetching fulfillments for an order.
 * Used for back-sync: pulling fulfillment data FROM Shopify INTO OHN.
 */
export interface ShopifyFulfillmentDetails {
  id: number
  order_id: number
  status: string
  created_at: string
  updated_at: string
  tracking_company: string | null
  tracking_number: string | null
  tracking_numbers: string[]
  tracking_url: string | null
  tracking_urls: string[]
  line_items: Array<{
    id: number
    variant_id: number
    quantity: number
    sku?: string
    title?: string
  }>
}

export interface ShopifyFulfillmentsListResponse {
  fulfillments?: ShopifyFulfillmentDetails[]
  errors?: Record<string, string[]> | string
}

/**
 * Create a fulfillment for a Shopify order.
 * See: https://shopify.dev/docs/api/admin-rest/2024-01/resources/fulfillment
 */
export async function createFulfillment(
  orderId: string,
  fulfillmentData: ShopifyFulfillmentRequest
): Promise<{ fulfillment?: ShopifyFulfillmentResponse['fulfillment']; error?: string }> {
  const { data, error } = await shopifyFetch<ShopifyFulfillmentResponse>(
    `/orders/${orderId}/fulfillments.json`,
    {
      method: 'POST',
      body: JSON.stringify(fulfillmentData),
    }
  )

  if (error) {
    return { error }
  }

  return { fulfillment: data?.fulfillment }
}

/**
 * Get fulfillment orders for a Shopify order.
 * Required for the modern fulfillment API (2023-01+).
 */
export async function getFulfillmentOrders(
  orderId: string
): Promise<{ fulfillment_orders?: Array<{ id: number; status: string }>; error?: string }> {
  const { data, error } = await shopifyFetch<{ fulfillment_orders: Array<{ id: number; status: string }> }>(
    `/orders/${orderId}/fulfillment_orders.json`
  )

  if (error) {
    return { error }
  }

  return { fulfillment_orders: data?.fulfillment_orders }
}

/**
 * Get all fulfillments for a Shopify order.
 * Used for back-sync: pulling tracking numbers and shipped line items from Shopify to OHN.
 * See: https://shopify.dev/docs/api/admin-rest/2024-01/resources/fulfillment#get-orders-order-id-fulfillments
 */
export async function getOrderFulfillments(
  orderId: string
): Promise<{ fulfillments?: ShopifyFulfillmentDetails[]; error?: string }> {
  const { data, error } = await shopifyFetch<ShopifyFulfillmentsListResponse>(
    `/orders/${orderId}/fulfillments.json`
  )

  if (error) {
    return { error }
  }

  return { fulfillments: data?.fulfillments ?? [] }
}

// ============================================================================
// Convenience Exports
// ============================================================================

export const shopify = {
  isConfigured: isShopifyConfigured,
  orders: {
    create: createOrder,
    get: getOrder,
  },
  customers: {
    create: createCustomer,
    get: getCustomer,
    update: updateCustomer,
    findByEmail: findCustomerByEmail,
    list: listCustomers,
    listAll: listAllCustomers,
  },
  fulfillments: {
    create: createFulfillment,
    getFulfillmentOrders: getFulfillmentOrders,
    list: getOrderFulfillments,
  },
}
