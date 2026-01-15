'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'
import {
  shopify,
  type ShopifyOrderRequest,
  type ShopifyCustomerRequest,
} from '@/lib/shopify/client'
import { findShopifyVariant, findCachedShopifyCustomer } from '@/lib/data/queries/shopify'
import type {
  ShopifyTransferResult,
  AddMissingSkuInput,
  ShopifyValidationResult,
  BulkTransferResult,
  InventoryStatusItem,
  SyncOrderStatusResult,
  BulkSyncResult,
} from '@/lib/types/shopify'

// ============================================================================
// Auth Helper
// ============================================================================

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  return session
}

// ============================================================================
// Missing SKU Actions
// ============================================================================

/**
 * Mark a missing SKU as reviewed (ignored).
 * Updates IsReviewed = true in MissingShopifySkus table.
 */
export async function ignoreMissingSku(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()

    await prisma.missingShopifySkus.update({
      where: { ID: BigInt(id) },
      data: { IsReviewed: true, DateModified: new Date() },
    })

    revalidatePath('/admin/shopify')
    return { success: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to ignore SKU'
    return { success: false, error: message }
  }
}

/**
 * Bulk mark missing SKUs as reviewed.
 */
export async function bulkIgnoreMissingSkus(
  ids: string[]
): Promise<{ success: boolean; ignored: number; error?: string }> {
  try {
    await requireAdmin()

    const result = await prisma.missingShopifySkus.updateMany({
      where: { ID: { in: ids.map((id) => BigInt(id)) } },
      data: { IsReviewed: true, DateModified: new Date() },
    })

    revalidatePath('/admin/shopify')
    return { success: true, ignored: result.count }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to bulk ignore SKUs'
    return { success: false, ignored: 0, error: message }
  }
}

/**
 * Add a missing SKU to the Sku inventory table.
 * Copies data from MissingShopifySkus and marks as reviewed.
 */
export async function addMissingSkuToInventory(
  input: AddMissingSkuInput
): Promise<{ success: boolean; skuId?: string; error?: string }> {
  try {
    await requireAdmin()

    // Get the missing SKU data
    const missing = await prisma.missingShopifySkus.findUnique({
      where: { ID: BigInt(input.missingSkuId) },
    })

    if (!missing) {
      return { success: false, error: 'Missing SKU not found' }
    }

    // Check if SKU already exists
    const existing = await prisma.sku.findFirst({
      where: { SkuID: missing.SkuID },
    })

    if (existing) {
      // Mark as reviewed since it already exists
      await prisma.missingShopifySkus.update({
        where: { ID: BigInt(input.missingSkuId) },
        data: { IsReviewed: true, DateModified: new Date() },
      })
      return { success: false, error: 'SKU already exists in inventory' }
    }

    // Create new SKU in inventory
    const now = new Date()
    const newSku = await prisma.sku.create({
      data: {
        SkuID: missing.SkuID,
        Description: input.description || missing.Description,
        Quantity: missing.Quantity,
        Price: missing.Price,
        FabricContent: input.fabricContent || missing.FabricContent,
        SkuColor: input.skuColor || missing.SkuColor,
        CategoryID: input.categoryId,
        PriceCAD: input.priceCAD,
        PriceUSD: input.priceUSD,
        MSRPCAD: input.msrpCAD || missing.MSRPCAD,
        MSRPUSD: input.msrpUSD || missing.MSRPUSD,
        OrderEntryDescription: missing.OrderEntryDescription,
        Season: missing.Season,
        ShopifyProductVariantId: missing.ShopifyProductVariantId,
        DateAdded: now,
        DateModified: now,
      },
      select: { ID: true },
    })

    // Mark missing SKU as reviewed
    await prisma.missingShopifySkus.update({
      where: { ID: BigInt(input.missingSkuId) },
      data: { IsReviewed: true, DateModified: now },
    })

    revalidatePath('/admin/shopify')
    revalidatePath('/admin/products')
    return { success: true, skuId: String(newSku.ID) }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to add SKU to inventory'
    return { success: false, error: message }
  }
}

/**
 * Bulk add missing SKUs to inventory with a default category.
 */
export async function bulkAddMissingSkus(
  ids: string[],
  defaultCategoryId: number
): Promise<{
  success: boolean
  added: number
  errors?: Array<{ id: string; error: string }>
}> {
  await requireAdmin()

  const results: Array<{ id: string; error: string }> = []
  let added = 0

  for (const id of ids) {
    // Get missing SKU
    const missing = await prisma.missingShopifySkus.findUnique({
      where: { ID: BigInt(id) },
    })

    if (!missing) {
      results.push({ id, error: 'Not found' })
      continue
    }

    // Check if already exists
    const existing = await prisma.sku.findFirst({
      where: { SkuID: missing.SkuID },
    })

    if (existing) {
      // Just mark as reviewed
      await prisma.missingShopifySkus.update({
        where: { ID: BigInt(id) },
        data: { IsReviewed: true, DateModified: new Date() },
      })
      results.push({ id, error: 'Already exists' })
      continue
    }

    try {
      const now = new Date()
      await prisma.sku.create({
        data: {
          SkuID: missing.SkuID,
          Description: missing.Description,
          Quantity: missing.Quantity,
          Price: missing.Price,
          FabricContent: missing.FabricContent,
          SkuColor: missing.SkuColor,
          CategoryID: defaultCategoryId,
          PriceCAD: missing.PriceCAD,
          PriceUSD: missing.PriceUSD,
          MSRPCAD: missing.MSRPCAD,
          MSRPUSD: missing.MSRPUSD,
          OrderEntryDescription: missing.OrderEntryDescription,
          Season: missing.Season,
          ShopifyProductVariantId: missing.ShopifyProductVariantId,
          DateAdded: now,
          DateModified: now,
        },
      })

      await prisma.missingShopifySkus.update({
        where: { ID: BigInt(id) },
        data: { IsReviewed: true, DateModified: now },
      })

      added++
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add'
      results.push({ id, error: message })
    }
  }

  revalidatePath('/admin/shopify')
  revalidatePath('/admin/products')

  return {
    success: added > 0,
    added,
    errors: results.length > 0 ? results : undefined,
  }
}

// ============================================================================
// Order Transfer to Shopify
// ============================================================================

/**
 * Transfer an order to Shopify.
 * Ported from .NET CustomersOrders.aspx.cs TransferOrderToShopify (~370 lines).
 * 
 * Flow:
 * 1. Get order and items from database
 * 2. Match each item to Shopify variant (by ShopifyId or SKU fallback)
 * 3. If any items missing, return error with list
 * 4. Build Shopify order request with customer, addresses, line items, tags
 * 5. Create order in Shopify
 * 6. If customer not found, create customer and retry
 * 7. On success, update IsTransferredToShopify = true
 */
export async function transferOrderToShopify(
  orderId: string
): Promise<ShopifyTransferResult> {
  try {
    await requireAdmin()

    // Check if Shopify is configured
    if (!shopify.isConfigured()) {
      return {
        success: false,
        error: 'Shopify is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN.',
      }
    }

    // 1. Get order info
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
    })

    if (!order) {
      return { success: false, error: 'Order not found' }
    }

    // Check if already transferred
    if (order.IsTransferredToShopify) {
      return { success: false, error: 'Order already transferred to Shopify' }
    }

    // 2. Get order items
    const orderItems = await prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: order.ID },
    })

    if (orderItems.length === 0) {
      return { success: false, error: 'Order has no items' }
    }

    // 3. Get customer info
    const customer = await prisma.customers.findFirst({
      where: { StoreName: order.StoreName.trim() },
    })

    // 4. Match items to Shopify variants
    const missingSkus: string[] = []
    const lineItems: Array<{
      variant_id: number
      quantity: number
      price: string
      name: string
      title: string
      requires_shipping: boolean
      grams: number
    }> = []

    for (const item of orderItems) {
      const variant = await findShopifyVariant(
        item.SKUVariantID > 0 ? item.SKUVariantID : null,
        item.SKU
      )

      if (!variant || !variant.shopifyId) {
        missingSkus.push(item.SKU)
        continue
      }

      lineItems.push({
        variant_id: Number(variant.shopifyId),
        quantity: item.Quantity,
        price: String(item.Price),
        name: variant.displayName,
        title: variant.skuId,
        requires_shipping: true,
        grams: variant.weightInGrams ?? 0,
      })
    }

    // 5. If missing SKUs, return error
    if (missingSkus.length > 0) {
      return {
        success: false,
        missingSkus,
        error: `${missingSkus.length} SKU(s) not found in Shopify`,
      }
    }

    // 6. Build Shopify order request
    const { firstName, lastName } = splitName(order.StoreName)

    // Format ship window
    const shipWindowStart = formatDate(order.ShipStartDate)
    const shipWindowEnd = formatDate(order.ShipEndDate)
    const shipWindow = `${shipWindowStart} - ${shipWindowEnd}`

    // Build note
    let note = `| Ship Window: ${shipWindow}`
    if (order.CustomerPO?.trim()) {
      note += ` | Customer PO #s: ${order.CustomerPO.trim()}`
    }

    // Build tags: "ATS" or "Pre Order" + ", Wholesale, osc-ignore, {SalesRep}"
    const baseTags = `, Wholesale, osc-ignore, ${order.SalesRep}`
    const orderTag = order.OrderNumber.startsWith('A') ? 'ATS' : 'Pre Order'
    const tags = `${orderTag}${baseTags}`

    // Note attributes
    const noteAttributes = [
      { name: order.OrderNumber.startsWith('A') ? 'ATS Order Number' : 'Pre Order Number', value: order.OrderNumber },
      { name: 'Requested Ship Window', value: shipWindow },
      { name: 'Order Notes', value: order.OrderNotes?.trim() || '' },
      { name: 'Buyer Name', value: order.BuyerName },
      { name: 'Sales Rep.', value: order.SalesRep },
      { name: 'Store Name', value: order.StoreName.trim() },
      { name: 'Customer Email', value: order.CustomerEmail?.trim() || '' },
    ]

    if (order.CustomerPO?.trim()) {
      noteAttributes.push({ name: 'Customer PO #', value: order.CustomerPO.trim() })
    }

    // Determine country code
    const billingCountryCode = customer?.Country?.includes('US') ? 'US' : 'CA'
    const shippingCountryCode = customer?.ShippingCountry?.includes('US') ? 'US' : 'CA'

    const shopifyOrderRequest: ShopifyOrderRequest = {
      order: {
        name: order.OrderNumber,
        note,
        tags,
        financial_status: 'pending',
        inventory_behaviour: 'decrement_ignoring_policy',
        use_customer_default_address: false,
        customer: {
          email: order.CustomerEmail,
          first_name: firstName,
          last_name: lastName,
          tags: `Wholesale, ${order.SalesRep}`,
        },
        billing_address: {
          address1: customer?.Street1?.trim() || '',
          address2: customer?.Street2?.trim() || '',
          city: customer?.City?.trim() || '',
          province: customer?.StateProvince?.trim() || '',
          province_code: customer?.StateProvince?.trim() || '',
          phone: customer?.Phone?.trim() || '',
          name: order.BuyerName?.trim() || '',
          company: order.StoreName?.trim() || '',
          zip: customer?.ZipPostal?.trim() || '',
          country: customer?.Country?.trim() || '',
          country_code: billingCountryCode,
        },
        shipping_address: {
          address1: customer?.ShippingStreet1?.trim() || '',
          address2: customer?.ShippingStreet2?.trim() || '',
          city: customer?.ShippingCity?.trim() || '',
          province: customer?.ShippingStateProvince?.trim() || '',
          province_code: customer?.ShippingStateProvince?.trim() || '',
          phone: customer?.Phone?.trim() || '',
          name: order.BuyerName?.trim() || '',
          company: order.StoreName?.trim() || '',
          zip: customer?.ShippingZipPostal?.trim() || '',
          country: customer?.ShippingCountry?.trim() || '',
          country_code: shippingCountryCode,
        },
        line_items: lineItems,
        note_attributes: noteAttributes,
      },
    }

    // 7. Create order in Shopify
    const { order: createdOrder, error: createError } = await shopify.orders.create(shopifyOrderRequest)

    let customerCreated = false

    // 8. Handle customer not found - create customer and retry
    if (createError === 'CUSTOMER_NOT_FOUND') {
      // Create customer in Shopify
      const customerRequest: ShopifyCustomerRequest = {
        customer: {
          email: order.CustomerEmail,
          first_name: firstName,
          last_name: lastName,
          tags: `Wholesale, ${order.SalesRep}`,
        },
      }

      const { customer: newCustomer, error: customerError } = await shopify.customers.create(customerRequest)

      if (customerError || !newCustomer) {
        return {
          success: false,
          error: `Failed to create customer in Shopify: ${customerError || 'Unknown error'}`,
        }
      }

      // Store new customer in our database
      await prisma.customersFromShopify.create({
        data: {
          ID: BigInt(newCustomer.id),
          ShopifyID: `gid://shopify/Customer/${newCustomer.id}`,
          Email: newCustomer.email,
        },
      })

      customerCreated = true

      // Retry order creation with customer ID
      shopifyOrderRequest.order.customer!.id = newCustomer.id

      const retryResult = await shopify.orders.create(shopifyOrderRequest)

      if (retryResult.error) {
        return {
          success: false,
          customerCreated: true,
          error: `Created customer but failed to create order: ${retryResult.error}`,
        }
      }

      if (!retryResult.order) {
        return {
          success: false,
          customerCreated: true,
          error: 'Created customer but order creation returned no data',
        }
      }

      // Success on retry
      await prisma.customerOrders.update({
        where: { ID: order.ID },
        data: {
          IsTransferredToShopify: true,
          ShopifyOrderID: String(retryResult.order.id),
        },
      })

      revalidatePath('/admin/orders')
      revalidatePath('/admin/shopify')

      return {
        success: true,
        shopifyOrderId: String(retryResult.order.id),
        shopifyOrderNumber: retryResult.order.name,
        customerCreated: true,
      }
    }

    // Handle other errors
    if (createError) {
      return { success: false, error: createError }
    }

    if (!createdOrder) {
      return { success: false, error: 'Order creation returned no data' }
    }

    // 9. Success - update database
    await prisma.customerOrders.update({
      where: { ID: order.ID },
      data: {
        IsTransferredToShopify: true,
        ShopifyOrderID: String(createdOrder.id),
      },
    })

    revalidatePath('/admin/orders')
    revalidatePath('/admin/shopify')

    return {
      success: true,
      shopifyOrderId: String(createdOrder.id),
      shopifyOrderNumber: createdOrder.name,
      customerCreated,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to transfer order to Shopify'
    return { success: false, error: message }
  }
}

// ============================================================================
// Order Validation (Pre-Transfer Check)
// ============================================================================

/**
 * Validate an order before transferring to Shopify.
 * Checks:
 * - All SKUs exist in Shopify (blockers if missing)
 * - Customer exists in Shopify cache
 * - Inventory availability vs ordered quantities (warnings, not blockers)
 */
export async function validateOrderForShopify(
  orderId: string
): Promise<ShopifyValidationResult> {
  try {
    await requireAdmin()

    // Get order info
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        OrderNumber: true,
        StoreName: true,
        OrderAmount: true,
        CustomerEmail: true,
        IsTransferredToShopify: true,
      },
    })

    if (!order) {
      return {
        valid: false,
        orderId,
        orderNumber: '',
        storeName: '',
        orderAmount: 0,
        itemCount: 0,
        missingSkus: [],
        customerEmail: null,
        customerExists: false,
        inventoryStatus: [],
      }
    }

    // Get order items
    const orderItems = await prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: order.ID },
      select: {
        SKU: true,
        SKUVariantID: true,
        Quantity: true,
      },
    })

    // Check customer exists in Shopify cache
    let customerExists = false
    if (order.CustomerEmail) {
      const cachedCustomer = await findCachedShopifyCustomer(order.CustomerEmail)
      customerExists = !!cachedCustomer
    }

    // Check each item for Shopify variant and inventory
    const missingSkus: string[] = []
    const inventoryStatus: InventoryStatusItem[] = []

    for (const item of orderItems) {
      // Check if SKU exists in Shopify
      const variant = await findShopifyVariant(
        item.SKUVariantID > 0 ? item.SKUVariantID : null,
        item.SKU
      )

      if (!variant || !variant.shopifyId) {
        missingSkus.push(item.SKU)
        continue
      }

      // Check local inventory (Sku table)
      const localSku = await prisma.sku.findFirst({
        where: { SkuID: variant.skuId },
        select: { Quantity: true },
      })

      const available = localSku?.Quantity ?? 0
      const ordered = item.Quantity

      let status: InventoryStatusItem['status'] = 'ok'
      if (available === 0) {
        status = 'backorder'
      } else if (available < ordered) {
        status = 'partial'
      }

      inventoryStatus.push({
        sku: variant.skuId,
        ordered,
        available,
        status,
      })
    }

    return {
      valid: missingSkus.length === 0,
      orderId,
      orderNumber: order.OrderNumber,
      storeName: order.StoreName,
      orderAmount: order.OrderAmount,
      itemCount: orderItems.length,
      missingSkus,
      customerEmail: order.CustomerEmail,
      customerExists,
      inventoryStatus,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to validate order'
    console.error('validateOrderForShopify error:', message)
    return {
      valid: false,
      orderId,
      orderNumber: '',
      storeName: '',
      orderAmount: 0,
      itemCount: 0,
      missingSkus: [],
      customerEmail: null,
      customerExists: false,
      inventoryStatus: [],
    }
  }
}

// ============================================================================
// Bulk Transfer Orders to Shopify
// ============================================================================

/**
 * Transfer multiple orders to Shopify.
 * Processes orders sequentially with a delay to respect rate limits.
 */
export async function bulkTransferOrdersToShopify(
  orderIds: string[]
): Promise<BulkTransferResult> {
  await requireAdmin()

  const results: BulkTransferResult['results'] = []
  let successCount = 0
  let failedCount = 0

  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i]

    // Get order number for result tracking
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: { OrderNumber: true },
    })

    const orderNumber = order?.OrderNumber ?? orderId

    try {
      const result = await transferOrderToShopify(orderId)

      if (result.success) {
        successCount++
        results.push({
          orderId,
          orderNumber,
          success: true,
          shopifyOrderNumber: result.shopifyOrderNumber,
        })
      } else {
        failedCount++
        results.push({
          orderId,
          orderNumber,
          success: false,
          error: result.error || 'Unknown error',
        })
      }
    } catch (e) {
      failedCount++
      results.push({
        orderId,
        orderNumber,
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    }

    // Rate limiting delay (500ms between orders, skip on last)
    if (i < orderIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  return {
    success: successCount,
    failed: failedCount,
    results,
  }
}

// ============================================================================
// Sync Order Status FROM Shopify
// ============================================================================

/**
 * Sync a single order's status from Shopify.
 * Fetches fulfillment_status and financial_status from Shopify
 * and updates the local database.
 */
export async function syncOrderStatusFromShopify(
  orderId: string
): Promise<SyncOrderStatusResult> {
  try {
    await requireAdmin()

    if (!shopify.isConfigured()) {
      return {
        success: false,
        orderId,
        error: 'Shopify is not configured',
      }
    }

    // Get order from database
    const order = await prisma.customerOrders.findUnique({
      where: { ID: BigInt(orderId) },
      select: {
        ID: true,
        ShopifyOrderID: true,
        IsTransferredToShopify: true,
      },
    })

    if (!order) {
      return { success: false, orderId, error: 'Order not found' }
    }

    if (!order.IsTransferredToShopify || !order.ShopifyOrderID) {
      return { success: false, orderId, error: 'Order has not been transferred to Shopify' }
    }

    // Fetch order from Shopify
    const { order: shopifyOrder, error } = await shopify.orders.get(order.ShopifyOrderID)

    if (error) {
      return { success: false, orderId, shopifyOrderId: order.ShopifyOrderID, error }
    }

    if (!shopifyOrder) {
      return { success: false, orderId, shopifyOrderId: order.ShopifyOrderID, error: 'Order not found in Shopify' }
    }

    // Update local database with Shopify status
    await prisma.customerOrders.update({
      where: { ID: order.ID },
      data: {
        ShopifyFulfillmentStatus: shopifyOrder.fulfillment_status,
        ShopifyFinancialStatus: shopifyOrder.financial_status,
        ShopifyStatusSyncedAt: new Date(),
      },
    })

    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)

    return {
      success: true,
      orderId,
      shopifyOrderId: order.ShopifyOrderID,
      fulfillmentStatus: shopifyOrder.fulfillment_status,
      financialStatus: shopifyOrder.financial_status,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to sync order status'
    return { success: false, orderId, error: message }
  }
}

/**
 * Sync status for all orders that have been transferred to Shopify
 * but haven't been synced recently (within the specified minutes).
 * 
 * Used by the cron job for reconciliation.
 */
export async function syncAllPendingOrderStatuses(options?: {
  syncedMoreThanMinutesAgo?: number
  transferredWithinDays?: number
  limit?: number
}): Promise<BulkSyncResult> {
  const syncedMoreThanMinutesAgo = options?.syncedMoreThanMinutesAgo ?? 30
  const transferredWithinDays = options?.transferredWithinDays ?? 30
  const limit = options?.limit ?? 100

  const cutoffDate = new Date()
  cutoffDate.setMinutes(cutoffDate.getMinutes() - syncedMoreThanMinutesAgo)

  const oldestOrderDate = new Date()
  oldestOrderDate.setDate(oldestOrderDate.getDate() - transferredWithinDays)

  try {
    // Find orders that need syncing
    const ordersToSync = await prisma.customerOrders.findMany({
      where: {
        IsTransferredToShopify: true,
        ShopifyOrderID: { not: null },
        OrderDate: { gte: oldestOrderDate },
        OR: [
          { ShopifyStatusSyncedAt: null },
          { ShopifyStatusSyncedAt: { lt: cutoffDate } },
        ],
      },
      select: {
        ID: true,
        ShopifyOrderID: true,
      },
      take: limit,
      orderBy: { OrderDate: 'desc' },
    })

    if (ordersToSync.length === 0) {
      return { success: true, synced: 0, failed: 0, errors: [] }
    }

    let synced = 0
    let failed = 0
    const errors: Array<{ orderId: string; error: string }> = []

    for (const order of ordersToSync) {
      if (!order.ShopifyOrderID) continue

      try {
        const { order: shopifyOrder, error } = await shopify.orders.get(order.ShopifyOrderID)

        if (error || !shopifyOrder) {
          failed++
          errors.push({ orderId: String(order.ID), error: error || 'Order not found in Shopify' })
          continue
        }

        await prisma.customerOrders.update({
          where: { ID: order.ID },
          data: {
            ShopifyFulfillmentStatus: shopifyOrder.fulfillment_status,
            ShopifyFinancialStatus: shopifyOrder.financial_status,
            ShopifyStatusSyncedAt: new Date(),
          },
        })

        synced++
      } catch (e) {
        failed++
        errors.push({
          orderId: String(order.ID),
          error: e instanceof Error ? e.message : 'Unknown error',
        })
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    revalidatePath('/admin/orders')

    return { success: true, synced, failed, errors }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to sync order statuses'
    return { success: false, synced: 0, failed: 0, errors: [{ orderId: 'bulk', error: message }] }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Split a full name into first and last name.
 * Matches .NET SplitName logic.
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName?.trim()) {
    return { firstName: '', lastName: '' }
  }

  const names = fullName.trim().split(/\s+/)

  if (names.length === 0) {
    return { firstName: '', lastName: '' }
  }

  const firstName = names[0]
  const lastName = names.length === 1 ? names[0] : names.slice(1).join(' ')

  return { firstName, lastName }
}

/**
 * Format a date as MM/dd/yyyy.
 */
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
}
