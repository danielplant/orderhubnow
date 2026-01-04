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
import type { ShopifyTransferResult, AddMissingSkuInput } from '@/lib/types/shopify'

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
        data: { IsTransferredToShopify: true },
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
      data: { IsTransferredToShopify: true },
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
