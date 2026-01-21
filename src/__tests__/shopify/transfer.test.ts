import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tests for Shopify order transfer functionality.
 * 
 * These tests mock the database and Shopify API to verify:
 * - validateOrderForShopify correctly identifies missing SKUs and inventory status
 * - bulkTransferOrdersToShopify processes orders sequentially
 * - ShopifyOrderID is stored after successful transfer
 */

// ============================================================================
// Mock Setup - Must be hoisted before imports
// ============================================================================

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    customerOrders: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    customerOrdersItems: {
      findMany: vi.fn(),
    },
    customersFromShopify: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    customers: {
      findFirst: vi.fn(),
    },
    rawSkusFromShopify: {
      findFirst: vi.fn(),
    },
    sku: {
      findFirst: vi.fn(),
    },
  },
}))

// Mock auth - return admin user for all tests
vi.mock('@/lib/auth/providers', () => ({
  auth: vi.fn(() => Promise.resolve({
    user: { role: 'admin', name: 'Test Admin', loginId: 'admin' },
  })),
}))

// Mock Shopify client
vi.mock('@/lib/shopify/client', () => ({
  shopify: {
    isConfigured: () => true,
    orders: {
      create: vi.fn(),
    },
    customers: {
      create: vi.fn(),
    },
  },
  isShopifyConfigured: () => true,
}))

// Mock revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock findShopifyVariant and findCachedShopifyCustomer
vi.mock('@/lib/data/queries/shopify', () => ({
  findShopifyVariant: vi.fn(),
  findCachedShopifyCustomer: vi.fn(),
}))

// Mock status cascade config
vi.mock('@/lib/data/queries/sync-config', () => ({
  getStatusCascadeConfig: vi.fn(() =>
    Promise.resolve({
      ingestionAllowed: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
      skuAllowed: ['ACTIVE'],
      transferAllowed: ['ACTIVE'],
    })
  ),
}))

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { prisma } from '@/lib/prisma'
import { shopify } from '@/lib/shopify/client'
import { findShopifyVariant, findCachedShopifyCustomer } from '@/lib/data/queries/shopify'
import {
  validateOrderForShopify,
  bulkTransferOrdersToShopify,
  transferOrderToShopify,
} from '@/lib/data/actions/shopify'

// ============================================================================
// Test Data
// ============================================================================

const mockOrder = {
  ID: BigInt(123),
  OrderNumber: 'A-12345',
  StoreName: 'Test Store',
  OrderAmount: 500.00,
  CustomerEmail: 'test@example.com',
  IsTransferredToShopify: false,
  ShipStartDate: new Date('2026-01-15'),
  ShipEndDate: new Date('2026-01-30'),
  CustomerPO: 'PO-123',
  OrderNotes: 'Test notes',
  BuyerName: 'Test Buyer',
  SalesRep: 'Jane Doe',
}

const mockOrderItems = [
  { SKU: 'SKU-001', SKUVariantID: BigInt(1), Quantity: 5, Price: 50 },
  { SKU: 'SKU-002', SKUVariantID: BigInt(2), Quantity: 3, Price: 100 },
]

const mockCustomer = {
  StoreName: 'Test Store',
  Street1: '123 Main St',
  Street2: '',
  City: 'Toronto',
  StateProvince: 'ON',
  ZipPostal: 'M5V 1A1',
  Country: 'Canada',
  Phone: '555-1234',
  ShippingStreet1: '456 Ship St',
  ShippingStreet2: '',
  ShippingCity: 'Vancouver',
  ShippingStateProvince: 'BC',
  ShippingZipPostal: 'V6B 2W2',
  ShippingCountry: 'Canada',
}

const mockShopifyVariant = {
  id: 1,
  shopifyId: BigInt(12345),
  skuId: 'SKU-001',
  displayName: 'Test Product',
  price: 50,
  weightInGrams: 100,
  productStatus: 'ACTIVE',
}

// ============================================================================
// Tests: validateOrderForShopify
// ============================================================================

describe('validateOrderForShopify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return valid:true when all SKUs exist in Shopify', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue(mockOrderItems as never)
    vi.mocked(findCachedShopifyCustomer).mockResolvedValue({ id: BigInt(1), shopifyId: 'gid://shopify/Customer/1' })
    vi.mocked(findShopifyVariant).mockResolvedValue(mockShopifyVariant)
    vi.mocked(prisma.sku.findFirst).mockResolvedValue({ Quantity: 10 } as never)

    const result = await validateOrderForShopify('123')

    expect(result.valid).toBe(true)
    expect(result.missingSkus).toHaveLength(0)
    expect(result.orderNumber).toBe('A-12345')
    expect(result.itemCount).toBe(2)
  })

  it('should return valid:false with missingSkus when SKU not found in Shopify', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue(mockOrderItems as never)
    vi.mocked(findCachedShopifyCustomer).mockResolvedValue(null)
    vi.mocked(findShopifyVariant)
      .mockResolvedValueOnce(mockShopifyVariant) // First SKU found
      .mockResolvedValueOnce(null) // Second SKU NOT found
    vi.mocked(prisma.sku.findFirst).mockResolvedValue({ Quantity: 10 } as never)

    const result = await validateOrderForShopify('123')

    expect(result.valid).toBe(false)
    expect(result.missingSkus).toContain('SKU-002')
    expect(result.missingSkus).toHaveLength(1)
  })

  it('should show backorder status when available quantity is 0', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue([mockOrderItems[0]] as never)
    vi.mocked(findCachedShopifyCustomer).mockResolvedValue(null)
    vi.mocked(findShopifyVariant).mockResolvedValue(mockShopifyVariant)
    vi.mocked(prisma.sku.findFirst).mockResolvedValue({ Quantity: 0 } as never) // No inventory

    const result = await validateOrderForShopify('123')

    expect(result.valid).toBe(true) // Still valid - inventory is a warning, not a blocker
    expect(result.inventoryStatus).toHaveLength(1)
    expect(result.inventoryStatus[0].status).toBe('backorder')
    expect(result.inventoryStatus[0].available).toBe(0)
    expect(result.inventoryStatus[0].ordered).toBe(5)
  })

  it('should show partial status when available < ordered', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue([
      { SKU: 'SKU-001', SKUVariantID: BigInt(1), Quantity: 10, Price: 50 },
    ] as never)
    vi.mocked(findCachedShopifyCustomer).mockResolvedValue(null)
    vi.mocked(findShopifyVariant).mockResolvedValue(mockShopifyVariant)
    vi.mocked(prisma.sku.findFirst).mockResolvedValue({ Quantity: 3 } as never) // Only 3 available

    const result = await validateOrderForShopify('123')

    expect(result.inventoryStatus[0].status).toBe('partial')
    expect(result.inventoryStatus[0].available).toBe(3)
    expect(result.inventoryStatus[0].ordered).toBe(10)
  })

  it('should show ok status when available >= ordered', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue([
      { SKU: 'SKU-001', SKUVariantID: BigInt(1), Quantity: 5, Price: 50 },
    ] as never)
    vi.mocked(findCachedShopifyCustomer).mockResolvedValue(null)
    vi.mocked(findShopifyVariant).mockResolvedValue(mockShopifyVariant)
    vi.mocked(prisma.sku.findFirst).mockResolvedValue({ Quantity: 10 } as never) // Plenty available

    const result = await validateOrderForShopify('123')

    expect(result.inventoryStatus[0].status).toBe('ok')
  })

  it('should indicate customerExists when customer is in Shopify cache', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue([] as never)
    vi.mocked(findCachedShopifyCustomer).mockResolvedValue({ id: BigInt(1), shopifyId: 'gid://shopify/Customer/1' })

    const result = await validateOrderForShopify('123')

    expect(result.customerExists).toBe(true)
  })

  it('should indicate customerExists:false when customer not in cache', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue([] as never)
    vi.mocked(findCachedShopifyCustomer).mockResolvedValue(null)

    const result = await validateOrderForShopify('123')

    expect(result.customerExists).toBe(false)
  })
})

// ============================================================================
// Tests: bulkTransferOrdersToShopify
// ============================================================================

describe('bulkTransferOrdersToShopify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should process orders sequentially and return results', async () => {
    // Setup mocks for two orders
    vi.mocked(prisma.customerOrders.findUnique)
      .mockResolvedValueOnce({ ...mockOrder, ID: BigInt(1), OrderNumber: 'A-001' } as never)
      .mockResolvedValueOnce({ ...mockOrder, ID: BigInt(1), OrderNumber: 'A-001' } as never)
      .mockResolvedValueOnce({ ...mockOrder, ID: BigInt(2), OrderNumber: 'A-002' } as never)
      .mockResolvedValueOnce({ ...mockOrder, ID: BigInt(2), OrderNumber: 'A-002' } as never)

    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue(mockOrderItems as never)
    vi.mocked(prisma.customers.findFirst).mockResolvedValue(mockCustomer as never)
    vi.mocked(findShopifyVariant).mockResolvedValue(mockShopifyVariant)
    vi.mocked(shopify.orders.create)
      .mockResolvedValueOnce({ order: { id: 1001, order_number: 1001, name: '#1001' } })
      .mockResolvedValueOnce({ order: { id: 1002, order_number: 1002, name: '#1002' } })
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)

    const promise = bulkTransferOrdersToShopify(['1', '2'])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.results).toHaveLength(2)
    expect(result.results[0].success).toBe(true)
    expect(result.results[1].success).toBe(true)
  })

  it('should continue processing after a failure and report results', async () => {
    // First order succeeds, second fails due to missing SKU
    vi.mocked(prisma.customerOrders.findUnique)
      .mockResolvedValueOnce({ ...mockOrder, ID: BigInt(1), OrderNumber: 'A-001' } as never)
      .mockResolvedValueOnce({ ...mockOrder, ID: BigInt(1), OrderNumber: 'A-001' } as never)
      .mockResolvedValueOnce({ ...mockOrder, ID: BigInt(2), OrderNumber: 'A-002' } as never)
      .mockResolvedValueOnce({ ...mockOrder, ID: BigInt(2), OrderNumber: 'A-002' } as never)

    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue(mockOrderItems as never)
    vi.mocked(prisma.customers.findFirst).mockResolvedValue(mockCustomer as never)
    
    // First two calls succeed (for order 1), next two return null (for order 2)
    vi.mocked(findShopifyVariant)
      .mockResolvedValueOnce(mockShopifyVariant)
      .mockResolvedValueOnce(mockShopifyVariant)
      .mockResolvedValueOnce(null) // Missing for order 2
      .mockResolvedValueOnce(null)

    vi.mocked(shopify.orders.create).mockResolvedValue({ order: { id: 1001, order_number: 1001, name: '#1001' } })
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)

    const promise = bulkTransferOrdersToShopify(['1', '2'])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.success).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.results[0].success).toBe(true)
    expect(result.results[1].success).toBe(false)
    expect(result.results[1].error).toContain('not found in Shopify')
  })
})

// ============================================================================
// Tests: ShopifyOrderID Storage
// ============================================================================

describe('transferOrderToShopify - ShopifyOrderID storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should store ShopifyOrderID after successful transfer', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue(mockOrderItems as never)
    vi.mocked(prisma.customers.findFirst).mockResolvedValue(mockCustomer as never)
    vi.mocked(findShopifyVariant).mockResolvedValue(mockShopifyVariant)

    const shopifyOrderId = 9876543210
    vi.mocked(shopify.orders.create).mockResolvedValue({
      order: { id: shopifyOrderId, order_number: 1001, name: '#1001' },
    })
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)

    const result = await transferOrderToShopify('123')

    expect(result.success).toBe(true)
    expect(result.shopifyOrderId).toBe(String(shopifyOrderId))

    // Verify update was called with ShopifyOrderID
    expect(prisma.customerOrders.update).toHaveBeenCalledWith({
      where: { ID: BigInt(123) },
      data: {
        IsTransferredToShopify: true,
        ShopifyOrderID: String(shopifyOrderId),
      },
    })
  })

  it('should store ShopifyOrderID after customer creation retry', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue(mockOrderItems as never)
    vi.mocked(prisma.customers.findFirst).mockResolvedValue(mockCustomer as never)
    vi.mocked(findShopifyVariant).mockResolvedValue(mockShopifyVariant)

    // First attempt: customer not found, second: success
    const shopifyOrderId = 1111111111
    vi.mocked(shopify.orders.create)
      .mockResolvedValueOnce({ error: 'CUSTOMER_NOT_FOUND' })
      .mockResolvedValueOnce({ order: { id: shopifyOrderId, order_number: 2001, name: '#2001' } })

    vi.mocked(shopify.customers.create).mockResolvedValue({
      customer: { id: 555, email: 'test@example.com' },
    })
    vi.mocked(prisma.customersFromShopify.create).mockResolvedValue({} as never)
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)

    const result = await transferOrderToShopify('123')

    expect(result.success).toBe(true)
    expect(result.customerCreated).toBe(true)
    expect(result.shopifyOrderId).toBe(String(shopifyOrderId))

    // Verify update was called with ShopifyOrderID
    expect(prisma.customerOrders.update).toHaveBeenCalledWith({
      where: { ID: BigInt(123) },
      data: {
        IsTransferredToShopify: true,
        ShopifyOrderID: String(shopifyOrderId),
      },
    })
  })

  it('should not update ShopifyOrderID on transfer failure', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockOrder as never)
    vi.mocked(prisma.customerOrdersItems.findMany).mockResolvedValue(mockOrderItems as never)
    vi.mocked(findShopifyVariant).mockResolvedValue(null) // SKU not found

    const result = await transferOrderToShopify('123')

    expect(result.success).toBe(false)
    expect(result.missingSkus).toBeDefined()
    expect(result.missingSkus?.length).toBeGreaterThan(0)

    // Update should NOT have been called
    expect(prisma.customerOrders.update).not.toHaveBeenCalled()
  })
})
