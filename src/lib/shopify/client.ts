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

export interface ShopifyOrderResponse {
  order?: {
    id: number
    order_number: number
    name: string
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
// HTTP Client with Retry Logic
// ============================================================================

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate exponential backoff delay.
 * @param attempt - Zero-based attempt number
 * @param baseDelayMs - Base delay in milliseconds (default 2000)
 * @returns Delay in milliseconds
 */
function getBackoffDelay(attempt: number, baseDelayMs = 2000): number {
  // 2s, 4s, 8s, 16s with some jitter
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt)
  const jitter = Math.random() * 500 // Add up to 500ms jitter
  return exponentialDelay + jitter
}

/**
 * Check if an error is retryable (network errors, 429, 5xx).
 */
function isRetryableError(status: number, error?: string): boolean {
  // Network errors (status 0 or undefined)
  if (!status || status === 0) return true
  // Rate limiting
  if (status === 429) return true
  // Server errors
  if (status >= 500 && status < 600) return true
  // Timeout errors in error message
  if (error && (error.includes('timeout') || error.includes('ETIMEDOUT') || error.includes('ECONNRESET'))) {
    return true
  }
  return false
}

interface ShopifyFetchOptions extends RequestInit {
  maxRetries?: number
  retryDelayMs?: number
}

async function shopifyFetch<T>(
  endpoint: string,
  options: ShopifyFetchOptions = {}
): Promise<{ data: T | null; error?: string; status: number; retries?: number }> {
  const { maxRetries = 3, retryDelayMs = 2000, ...fetchOptions } = options
  const config = getConfig()
  const baseUrl = `https://${config.storeDomain}/admin/api/${config.apiVersion}`
  const url = `${baseUrl}${endpoint}`

  let lastError: string | undefined
  let lastStatus = 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.accessToken,
          ...fetchOptions.headers,
        },
      })

      const text = await response.text()
      let data: T | null = null

      try {
        data = text ? JSON.parse(text) : null
      } catch {
        // Response was not JSON
      }

      lastStatus = response.status

      if (!response.ok) {
        const errorMessage = typeof data === 'object' && data !== null && 'errors' in data
          ? JSON.stringify((data as { errors: unknown }).errors)
          : text || `HTTP ${response.status}`

        // Check if we should retry
        if (attempt < maxRetries && isRetryableError(response.status, errorMessage)) {
          const delay = getBackoffDelay(attempt, retryDelayMs)
          console.warn(`Shopify API error (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}. Retrying in ${Math.round(delay)}ms...`)
          await sleep(delay)
          lastError = errorMessage
          continue
        }

        return { data: null, error: errorMessage, status: response.status, retries: attempt }
      }

      return { data, status: response.status, retries: attempt }
    } catch (err) {
      // Network error
      const errorMessage = err instanceof Error ? err.message : 'Network error'
      lastError = errorMessage
      lastStatus = 0

      if (attempt < maxRetries && isRetryableError(0, errorMessage)) {
        const delay = getBackoffDelay(attempt, retryDelayMs)
        console.warn(`Shopify network error (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}. Retrying in ${Math.round(delay)}ms...`)
        await sleep(delay)
        continue
      }

      return { data: null, error: errorMessage, status: 0, retries: attempt }
    }
  }

  // Should not reach here, but just in case
  return { data: null, error: lastError || 'Max retries exceeded', status: lastStatus, retries: maxRetries }
}

// ============================================================================
// Orders API
// ============================================================================

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
// Convenience Exports
// ============================================================================

export const shopify = {
  isConfigured: isShopifyConfigured,
  orders: {
    create: createOrder,
  },
  customers: {
    create: createCustomer,
    findByEmail: findCustomerByEmail,
    list: listCustomers,
    listAll: listAllCustomers,
  },
}
