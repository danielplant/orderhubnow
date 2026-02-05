import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for order status change with Shopify sync.
 * 
 * These tests verify:
 * - updateOrderStatus correctly syncs with Shopify for Cancel/Invoiced
 * - Non-Shopify orders update without sync
 * - Error handling and sync results
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
    activityLogs: {
      create: vi.fn(),
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
      cancel: vi.fn(),
      close: vi.fn(),
    },
  },
}))

// Mock revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock activity logger
vi.mock('@/lib/audit/activity-logger', () => ({
  logOrderStatusChange: vi.fn(),
}))

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { prisma } from '@/lib/prisma'
import { shopify } from '@/lib/shopify/client'
import { updateOrderStatus } from '@/lib/data/actions/orders'

// ============================================================================
// Test Data
// ============================================================================

const mockShopifyOrder = {
  ID: BigInt(123),
  OrderNumber: 'A-12345',
  OrderStatus: 'Processing',
  IsTransferredToShopify: true,
  ShopifyOrderID: '7654321098765',
}

const mockNonShopifyOrder = {
  ID: BigInt(456),
  OrderNumber: 'A-67890',
  OrderStatus: 'Processing',
  IsTransferredToShopify: false,
  ShopifyOrderID: null,
}

// ============================================================================
// Tests: updateOrderStatus with Shopify sync
// ============================================================================

describe('updateOrderStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update non-Shopify order without sync', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockNonShopifyOrder as never)
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)

    const result = await updateOrderStatus({
      orderId: '456',
      newStatus: 'Cancelled',
    })

    expect(result.success).toBe(true)
    expect(result.shopifySync).toBeUndefined()
    expect(shopify.orders.cancel).not.toHaveBeenCalled()
  })

  it('should sync cancel to Shopify for Shopify order', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockShopifyOrder as never)
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)
    vi.mocked(shopify.orders.cancel).mockResolvedValue({ success: true })

    const result = await updateOrderStatus({
      orderId: '123',
      newStatus: 'Cancelled',
      options: {
        cancelReason: 'CUSTOMER',
        notifyCustomer: true,
        restockInventory: true,
      },
    })

    expect(result.success).toBe(true)
    expect(result.shopifySync).toBeDefined()
    expect(result.shopifySync?.attempted).toBe(true)
    expect(result.shopifySync?.success).toBe(true)

    expect(shopify.orders.cancel).toHaveBeenCalledWith('7654321098765', {
      reason: 'CUSTOMER',
      notifyCustomer: true,
      restock: true,
      staffNote: 'Cancelled from Order Hub',
    })
  })

  it('should sync close to Shopify for Invoiced status', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockShopifyOrder as never)
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)
    vi.mocked(shopify.orders.close).mockResolvedValue({ success: true, closedAt: '2026-01-15T10:30:00Z' })

    const result = await updateOrderStatus({
      orderId: '123',
      newStatus: 'Invoiced',
    })

    expect(result.success).toBe(true)
    expect(result.shopifySync?.attempted).toBe(true)
    expect(result.shopifySync?.success).toBe(true)
    expect(shopify.orders.close).toHaveBeenCalledWith('7654321098765')
  })

  it('should return sync error without updating local when Shopify fails', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockShopifyOrder as never)
    vi.mocked(shopify.orders.cancel).mockResolvedValue({ success: false, error: 'Order already cancelled' })

    const result = await updateOrderStatus({
      orderId: '123',
      newStatus: 'Cancelled',
      options: { cancelReason: 'CUSTOMER' },
    })

    expect(result.success).toBe(false)
    expect(result.shopifySync?.attempted).toBe(true)
    expect(result.shopifySync?.success).toBe(false)
    expect(result.shopifySync?.error).toBe('Order already cancelled')

    // Local update should NOT have been called
    expect(prisma.customerOrders.update).not.toHaveBeenCalled()
  })

  it('should skip Shopify sync when skipShopifySync option is true', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockShopifyOrder as never)
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)

    const result = await updateOrderStatus({
      orderId: '123',
      newStatus: 'Cancelled',
      options: {
        skipShopifySync: true,
        cancelReason: 'CUSTOMER',
      },
    })

    expect(result.success).toBe(true)
    expect(result.shopifySync?.attempted).toBe(false)
    expect(shopify.orders.cancel).not.toHaveBeenCalled()
    
    // Local update should still happen
    expect(prisma.customerOrders.update).toHaveBeenCalled()
  })

  it('should not sync for non-syncing statuses like Processing', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockShopifyOrder as never)
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)

    const result = await updateOrderStatus({
      orderId: '123',
      newStatus: 'Processing',
    })

    expect(result.success).toBe(true)
    expect(result.shopifySync).toBeUndefined()
    expect(shopify.orders.cancel).not.toHaveBeenCalled()
    expect(shopify.orders.close).not.toHaveBeenCalled()
  })

  it('should not sync for Shipped status', async () => {
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(mockShopifyOrder as never)
    vi.mocked(prisma.customerOrders.update).mockResolvedValue({} as never)

    const result = await updateOrderStatus({
      orderId: '123',
      newStatus: 'Shipped',
    })

    expect(result.success).toBe(true)
    expect(result.shopifySync).toBeUndefined()
    expect(shopify.orders.cancel).not.toHaveBeenCalled()
    expect(shopify.orders.close).not.toHaveBeenCalled()
  })

  it('should reject status change for cancelled orders', async () => {
    const cancelledOrder = {
      ...mockShopifyOrder,
      OrderStatus: 'Cancelled',
    }
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(cancelledOrder as never)

    const result = await updateOrderStatus({
      orderId: '123',
      newStatus: 'Processing',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Cannot change status of cancelled orders')
    expect(prisma.customerOrders.update).not.toHaveBeenCalled()
  })

  it('should reject status change for invoiced orders', async () => {
    const invoicedOrder = {
      ...mockShopifyOrder,
      OrderStatus: 'Invoiced',
    }
    vi.mocked(prisma.customerOrders.findUnique).mockResolvedValue(invoicedOrder as never)

    const result = await updateOrderStatus({
      orderId: '123',
      newStatus: 'Shipped',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Cannot change status of invoiced orders')
    expect(prisma.customerOrders.update).not.toHaveBeenCalled()
  })
})
