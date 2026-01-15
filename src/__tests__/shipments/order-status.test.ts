import { describe, it, expect } from 'vitest'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/types/order'

describe('ORDER_STATUSES', () => {
  it('should include Partially Shipped status', () => {
    expect(ORDER_STATUSES).toContain('Partially Shipped')
  })

  it('should have correct order of statuses', () => {
    const expectedOrder = [
      'Draft',
      'Pending',
      'Processing',
      'Partially Shipped',
      'Shipped',
      'Invoiced',
      'Cancelled',
    ]
    expect(ORDER_STATUSES).toEqual(expectedOrder)
  })
})

describe('Order Status Transitions', () => {
  const testOrder = {
    id: '1',
    status: 'Pending' as OrderStatus,
    items: [
      { id: '1', quantity: 10, shippedQty: 0, cancelledQty: 0 },
      { id: '2', quantity: 5, shippedQty: 0, cancelledQty: 0 },
    ],
  }

  it('should stay Pending with no shipments', () => {
    const hasShipments = false
    const newStatus = determineOrderStatus(testOrder.items, hasShipments, testOrder.status)
    expect(newStatus).toBe('Pending')
  })

  it('should become Partially Shipped on first partial shipment', () => {
    const items = [
      { id: '1', quantity: 10, shippedQty: 5, cancelledQty: 0 },
      { id: '2', quantity: 5, shippedQty: 0, cancelledQty: 0 },
    ]
    const hasShipments = true
    const newStatus = determineOrderStatus(items, hasShipments, 'Pending')
    expect(newStatus).toBe('Partially Shipped')
  })

  it('should become Shipped when fully fulfilled', () => {
    const items = [
      { id: '1', quantity: 10, shippedQty: 10, cancelledQty: 0 },
      { id: '2', quantity: 5, shippedQty: 5, cancelledQty: 0 },
    ]
    const hasShipments = true
    const newStatus = determineOrderStatus(items, hasShipments, 'Partially Shipped')
    expect(newStatus).toBe('Shipped')
  })

  it('should become Shipped when remaining items cancelled', () => {
    const items = [
      { id: '1', quantity: 10, shippedQty: 7, cancelledQty: 3 },
      { id: '2', quantity: 5, shippedQty: 5, cancelledQty: 0 },
    ]
    const hasShipments = true
    const newStatus = determineOrderStatus(items, hasShipments, 'Partially Shipped')
    expect(newStatus).toBe('Shipped')
  })

  it('should not change Invoiced orders', () => {
    const items = [
      { id: '1', quantity: 10, shippedQty: 5, cancelledQty: 0 },
    ]
    const hasShipments = true
    const newStatus = determineOrderStatus(items, hasShipments, 'Invoiced')
    expect(newStatus).toBe('Invoiced')
  })

  it('should not change Cancelled orders', () => {
    const items = [
      { id: '1', quantity: 10, shippedQty: 0, cancelledQty: 0 },
    ]
    const hasShipments = false
    const newStatus = determineOrderStatus(items, hasShipments, 'Cancelled')
    expect(newStatus).toBe('Cancelled')
  })
})

describe('Fulfillment Calculations', () => {
  it('should calculate fulfillment % correctly', () => {
    const items = [
      { quantity: 10, shippedQty: 5 },
      { quantity: 10, shippedQty: 10 },
    ]
    const totalOrdered = items.reduce((sum, i) => sum + i.quantity, 0)
    const totalShipped = items.reduce((sum, i) => sum + i.shippedQty, 0)
    const fulfillmentPct = Math.round((totalShipped / totalOrdered) * 100)
    
    expect(totalOrdered).toBe(20)
    expect(totalShipped).toBe(15)
    expect(fulfillmentPct).toBe(75)
  })

  it('should count remaining units correctly', () => {
    const items = [
      { quantity: 10, shippedQty: 5, cancelledQty: 2 },
      { quantity: 10, shippedQty: 10, cancelledQty: 0 },
    ]
    const remaining = items.reduce((sum, i) => sum + (i.quantity - i.shippedQty - i.cancelledQty), 0)
    
    expect(remaining).toBe(3) // (10-5-2) + (10-10-0) = 3 + 0
  })

  it('should exclude cancelled from remaining', () => {
    const item = { quantity: 10, shippedQty: 3, cancelledQty: 5 }
    const remaining = item.quantity - item.shippedQty - item.cancelledQty
    
    expect(remaining).toBe(2)
  })
})

// Helper function to simulate status determination logic
function determineOrderStatus(
  items: Array<{ quantity: number; shippedQty: number; cancelledQty: number }>,
  hasShipments: boolean,
  currentStatus: OrderStatus
): OrderStatus {
  // Don't change Invoiced or Cancelled orders
  if (currentStatus === 'Invoiced' || currentStatus === 'Cancelled') {
    return currentStatus
  }

  // Check if fully shipped (considering cancelled)
  let fullyShipped = true
  for (const item of items) {
    const effectiveQty = item.quantity - item.cancelledQty
    if (item.shippedQty < effectiveQty) {
      fullyShipped = false
      break
    }
  }

  if (fullyShipped && hasShipments) {
    return 'Shipped'
  }

  if (hasShipments && !fullyShipped) {
    return 'Partially Shipped'
  }

  return currentStatus
}
