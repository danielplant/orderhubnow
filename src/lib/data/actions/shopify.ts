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
import { getStatusCascadeConfig } from '@/lib/data/queries/sync-config'
import type {
  ShopifyTransferResult,
  AddMissingSkuInput,
  ShopifyValidationResult,
  BulkTransferResult,
  InventoryStatusItem,
  SyncOrderStatusResult,
  BulkSyncResult,
  TransferTag,
  TagSource,
  TagScope,
  TagValidation,
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
  orderId: string,
  options?: {
    /** Tag IDs to include (if not provided, all tags are included) */
    enabledTagIds?: string[]
  }
): Promise<ShopifyTransferResult> {
  try {
    await requireAdmin()
    const cascadeConfig = await getStatusCascadeConfig('Product')

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
    const inactiveSkus: string[] = []
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

      // Check if variant status is allowed for transfer (cascade filter)
      if (!cascadeConfig.transferAllowed.includes(variant.productStatus ?? '')) {
        inactiveSkus.push(item.SKU)
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

    // 5. If missing or inactive SKUs, return error
    if (missingSkus.length > 0 || inactiveSkus.length > 0) {
      const reasons: string[] = []
      if (missingSkus.length > 0) {
        reasons.push(`${missingSkus.length} SKU(s) not found in Shopify`)
      }
      if (inactiveSkus.length > 0) {
        reasons.push(`${inactiveSkus.length} SKU(s) inactive in Shopify`)
      }

      return {
        success: false,
        missingSkus,
        inactiveSkus,
        error: reasons.join('; '),
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

    // Derive collections for tags
    const { ohnCollection, shopifyRawValues } = await deriveCollectionsForOrder(
      orderItems.map((i) => i.SKU)
    )

    // Generate all tags
    const allTags = generateTransferTags({
      orderNumber: order.OrderNumber,
      salesRep: order.SalesRep,
      shipStartDate: order.ShipStartDate,
      shipEndDate: order.ShipEndDate,
      ohnCollection,
      shopifyRawValues,
    })

    // Filter tags based on enabledTagIds (if provided)
    const enabledTagIds = options?.enabledTagIds
    const filteredTags = enabledTagIds
      ? allTags.filter((t) => enabledTagIds.includes(t.id))
      : allTags

    // Build order tags string (only enabled order-scope tags)
    const orderTagValues = filteredTags
      .filter((t) => t.scope === 'order')
      .map((t) => t.value)
    const tags = orderTagValues.join(', ')

    // Build customer tags string (only enabled customer-scope tags)
    const customerTagValues = filteredTags
      .filter((t) => t.scope === 'customer')
      .map((t) => t.value)
    const customerTags = customerTagValues.join(', ')

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
          tags: customerTags,
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
      // Create customer in Shopify (use same customerTags from above)
      const customerRequest: ShopifyCustomerRequest = {
        customer: {
          email: order.CustomerEmail,
          first_name: firstName,
          last_name: lastName,
          tags: customerTags,
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

      // Populate ShopifyLineItemID for precise fulfillment mapping
      await populateShopifyLineItemIds(orderItems, retryResult.order.line_items)

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

    // Populate ShopifyLineItemID for precise fulfillment mapping
    await populateShopifyLineItemIds(orderItems, createdOrder.line_items)

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
    const cascadeConfig = await getStatusCascadeConfig('Product')

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
        ShipStartDate: true,
        ShipEndDate: true,
        SalesRep: true,
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
        inactiveSkus: [],
        customerEmail: null,
        customerExists: false,
        inventoryStatus: [],
        shipWindow: null,
        shipWindowTag: null,
        ohnCollection: null,
        shopifyCollectionRaw: null,
        shopifyCollectionRawValues: [],
        salesRep: null,
        tags: [],
        hasInvalidTags: false,
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
    const inactiveSkus: string[] = []
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

      // Check if variant status is allowed for transfer (cascade filter)
      if (!cascadeConfig.transferAllowed.includes(variant.productStatus ?? '')) {
        inactiveSkus.push(item.SKU)
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

    // Derive OHN collection and Shopify raw values from order items
    const { ohnCollection, shopifyRawValue, shopifyRawValues } = await deriveCollectionsForOrder(
      orderItems.map((i) => i.SKU)
    )

    // Generate transfer tags
    const tags = generateTransferTags({
      orderNumber: order.OrderNumber,
      salesRep: order.SalesRep,
      shipStartDate: order.ShipStartDate,
      shipEndDate: order.ShipEndDate,
      ohnCollection,
      shopifyRawValues,
    })

    // Check if any enabled tags are invalid
    const hasInvalidTags = tags.some(t => t.enabled && !t.validation.valid)

    return {
      valid: missingSkus.length === 0 && inactiveSkus.length === 0 && !hasInvalidTags,
      orderId,
      orderNumber: order.OrderNumber,
      storeName: order.StoreName,
      orderAmount: order.OrderAmount,
      itemCount: orderItems.length,
      missingSkus,
      inactiveSkus,
      customerEmail: order.CustomerEmail,
      customerExists,
      inventoryStatus,
      shipWindow: formatShipWindowDisplay(order.ShipStartDate, order.ShipEndDate),
      shipWindowTag: formatShipWindowTag(order.ShipStartDate, order.ShipEndDate),
      ohnCollection,
      shopifyCollectionRaw: shopifyRawValue,
      shopifyCollectionRawValues: shopifyRawValues,
      salesRep: order.SalesRep ?? null,
      tags,
      hasInvalidTags,
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
      inactiveSkus: [],
      customerEmail: null,
      customerExists: false,
      inventoryStatus: [],
      shipWindow: null,
      shipWindowTag: null,
      ohnCollection: null,
      shopifyCollectionRaw: null,
      shopifyCollectionRawValues: [],
      salesRep: null,
      tags: [],
      hasInvalidTags: false,
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
 * Populate ShopifyLineItemID on order items after successful transfer.
 * Maps Shopify line items back to local order items by variant_id.
 * For duplicate variants, uses quantity + price as secondary criteria.
 */
async function populateShopifyLineItemIds(
  orderItems: Array<{ ID: bigint; SKUVariantID: bigint; Quantity: number; Price: number }>,
  shopifyLineItems?: Array<{ id: number; variant_id: number; quantity: number; price: string }>
): Promise<void> {
  if (!shopifyLineItems || shopifyLineItems.length === 0) {
    return
  }

  // Track which local items have been matched to avoid double-mapping
  const matchedLocalIds = new Set<string>()

  for (const shopifyItem of shopifyLineItems) {
    // Find matching local items by variant_id
    const candidates = orderItems.filter(
      (oi) =>
        Number(oi.SKUVariantID) === shopifyItem.variant_id &&
        !matchedLocalIds.has(String(oi.ID))
    )

    if (candidates.length === 0) {
      continue
    }

    let match = candidates[0]

    // If multiple candidates (same variant_id), use quantity + price to disambiguate
    if (candidates.length > 1) {
      const exactMatch = candidates.find(
        (c) =>
          c.Quantity === shopifyItem.quantity &&
          Math.abs(c.Price - parseFloat(shopifyItem.price)) < 0.01
      )
      if (exactMatch) {
        match = exactMatch
      }
    }

    // Update the local order item with Shopify line item ID
    await prisma.customerOrdersItems.update({
      where: { ID: match.ID },
      data: { ShopifyLineItemID: String(shopifyItem.id) },
    })

    matchedLocalIds.add(String(match.ID))
  }
}

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

/**
 * Format ship window dates as a Shopify tag: SHIPWINDOW_YYYY-MM-DD_YYYY-MM-DD
 */
function formatShipWindowTag(startDate: Date | null, endDate: Date | null): string | null {
  if (!startDate || !endDate) return null
  const formatISO = (d: Date) => d.toISOString().slice(0, 10)
  return `SHIPWINDOW_${formatISO(startDate)}_${formatISO(endDate)}`
}

/**
 * Format ship window dates as user-friendly display: "Jan 15 – Jan 22, 2026"
 */
function formatShipWindowDisplay(startDate: Date | null, endDate: Date | null): string | null {
  if (!startDate || !endDate) return null
  const formatDate = (d: Date, includeYear: boolean) => {
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const day = d.getDate()
    if (includeYear) {
      const year = d.getFullYear()
      return `${month} ${day}, ${year}`
    }
    return `${month} ${day}`
  }
  // Always show year on end date for clarity
  return `${formatDate(startDate, false)} – ${formatDate(endDate, true)}`
}

/**
 * Derive season from ship window dates.
 * Spring/Summer (SS): Jan-Jun ship dates
 * Fall/Winter (FW): Jul-Dec ship dates
 * Returns e.g., "SS26" or "FW26"
 */
function deriveSeasonFromShipWindow(startDate: Date | null): string | null {
  if (!startDate) return null
  const month = startDate.getMonth() + 1 // 1-12
  const year = startDate.getFullYear().toString().slice(-2) // "26"
  if (month >= 1 && month <= 6) {
    return `SS${year}` // Spring/Summer
  } else {
    return `FW${year}` // Fall/Winter
  }
}

/**
 * Shopify tag validation rules:
 * - Max 255 characters
 * - No commas (used as separator)
 * - Only letters, numbers, spaces, underscores, hyphens allowed
 * - Parentheses, slashes, quotes, etc. are NOT allowed
 */
const SHOPIFY_TAG_INVALID_CHARS = /[^a-zA-Z0-9_\- ]/g

/**
 * Validate a tag value against Shopify rules.
 * Returns validation result with reason if invalid.
 */
function validateTagValue(tag: string): { valid: boolean; reason?: string } {
  if (!tag || !tag.trim()) {
    return { valid: false, reason: 'empty' }
  }
  if (tag.length > 255) {
    return { valid: false, reason: 'exceeds 255 characters' }
  }
  if (tag.includes(',')) {
    return { valid: false, reason: 'contains comma' }
  }
  if (SHOPIFY_TAG_INVALID_CHARS.test(tag)) {
    // Find the invalid characters for better error message
    const invalidChars = tag.match(SHOPIFY_TAG_INVALID_CHARS)
    const uniqueInvalid = [...new Set(invalidChars)].slice(0, 3).join(' ')
    return { valid: false, reason: `contains invalid characters: ${uniqueInvalid}` }
  }
  return { valid: true }
}

/**
 * Sanitize a tag value for Shopify.
 * Removes invalid characters and enforces length limit.
 */
function sanitizeTag(tag: string): string {
  return tag
    .replace(SHOPIFY_TAG_INVALID_CHARS, '') // Remove invalid chars (parentheses, etc.)
    .replace(/\s+/g, ' ')                    // Collapse multiple spaces
    .trim()
    .slice(0, 255)                           // Max 255 chars
}

/**
 * Generate transfer tags for an order.
 * Used by validation (to show in UI) and transfer (to send to Shopify).
 * Validates each tag and includes validation info so UI can warn about problems.
 */
function generateTransferTags(params: {
  orderNumber: string
  salesRep: string | null
  shipStartDate: Date | null
  shipEndDate: Date | null
  ohnCollection: string | null
  shopifyRawValues: string[]
}): TransferTag[] {
  const tags: TransferTag[] = []
  let id = 0

  const addTag = (scope: TagScope, source: TagSource, value: string) => {
    // Validate the original value
    const validationResult = validateTagValue(value)

    // Sanitize for actual transfer
    const sanitized = sanitizeTag(value)
    if (!sanitized) return // Skip completely empty tags

    // Build validation info
    const validation: TagValidation = validationResult.valid
      ? { valid: true }
      : {
          valid: false,
          reason: validationResult.reason,
          originalValue: value !== sanitized ? value : undefined
        }

    tags.push({
      id: String(id++),
      scope,
      source,
      value: sanitized,
      enabled: true,
      validation,
    })
  }

  // Order tags
  addTag('order', 'orderType', params.orderNumber.startsWith('A') ? 'ATS' : 'Pre Order')
  addTag('order', 'wholesale', 'Wholesale')
  addTag('order', 'oscIgnore', 'osc-ignore')

  if (params.salesRep?.trim()) {
    addTag('order', 'salesRep', params.salesRep.trim())
  }

  const shipWindowTag = formatShipWindowTag(params.shipStartDate, params.shipEndDate)
  if (shipWindowTag) {
    addTag('order', 'shipWindow', shipWindowTag)
  }

  const seasonTag = deriveSeasonFromShipWindow(params.shipStartDate)
  if (seasonTag) {
    addTag('order', 'season', `SEASON_${seasonTag}`)
  }

  if (params.ohnCollection && params.ohnCollection !== 'Mixed') {
    addTag('order', 'ohnCollection', `OHN_COLLECTION_${params.ohnCollection.replace(/\s+/g, '_').toUpperCase()}`)
  }

  for (const rawValue of params.shopifyRawValues) {
    addTag('order', 'shopifyCollection', `SHOPIFY_COLLECTION_${rawValue.replace(/\s+/g, '_').toUpperCase()}`)
  }

  // Customer tags
  addTag('customer', 'customerWholesale', 'Wholesale')
  if (params.salesRep?.trim()) {
    addTag('customer', 'customerSalesRep', params.salesRep.trim())
  }

  return tags
}

/**
 * Derive OHN collection and Shopify raw collection values for an order's SKUs.
 * Used by both validation and transfer.
 */
async function deriveCollectionsForOrder(skuIds: string[]): Promise<{
  ohnCollection: string | null
  shopifyRawValue: string | null
  shopifyRawValues: string[]
}> {
  if (skuIds.length === 0) {
    return { ohnCollection: null, shopifyRawValue: null, shopifyRawValues: [] }
  }

  // Look up SKUs with their CollectionID and Collection name
  const skus = await prisma.sku.findMany({
    where: { SkuID: { in: skuIds } },
    select: {
      SkuID: true,
      CollectionID: true,
      Collection: { select: { name: true } },
    },
  })

  // Derive OHN collection names
  const ohnCollections = new Set<string>()
  const collectionIds = new Set<number>()
  for (const sku of skus) {
    if (sku.Collection?.name) {
      ohnCollections.add(sku.Collection.name)
    }
    if (sku.CollectionID) {
      collectionIds.add(sku.CollectionID)
    }
  }

  // Get OHN collection display value
  let ohnCollection: string | null = null
  if (ohnCollections.size === 1) {
    ohnCollection = [...ohnCollections][0]
  } else if (ohnCollections.size > 1) {
    ohnCollection = 'Mixed'
  }

  // Get Shopify raw values from ShopifyValueMapping
  const shopifyRawValues: string[] = []
  if (collectionIds.size > 0) {
    const mappings = await prisma.shopifyValueMapping.findMany({
      where: {
        status: 'mapped',
        collectionId: { in: [...collectionIds] },
      },
      select: { rawValue: true },
    })
    for (const m of mappings) {
      if (!shopifyRawValues.includes(m.rawValue)) {
        shopifyRawValues.push(m.rawValue)
      }
    }
  }

  // Get single display value
  let shopifyRawValue: string | null = null
  if (shopifyRawValues.length === 1) {
    shopifyRawValue = shopifyRawValues[0]
  } else if (shopifyRawValues.length > 1) {
    shopifyRawValue = 'Mixed'
  }

  return { ohnCollection, shopifyRawValue, shopifyRawValues }
}
