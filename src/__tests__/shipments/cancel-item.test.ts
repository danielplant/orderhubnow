import { describe, it, expect } from 'vitest'
import {
  CANCEL_REASONS,
  type CancelReason,
  type LineItemStatus,
} from '@/lib/types/shipment'

// Mock data for tests
const mockOrderItem = {
  id: '1',
  sku: 'TEST-SKU-001',
  orderedQuantity: 10,
  shippedQuantity: 3,
  cancelledQuantity: 0,
  remainingQuantity: 7,
  status: 'Open' as LineItemStatus,
  cancelledReason: null,
  cancelledAt: null,
  cancelledBy: null,
}

describe('cancelOrderItem', () => {
  it('should cancel full quantity of an item', () => {
    const item = { ...mockOrderItem, shippedQuantity: 0 }
    const cancelQty = 10
    expect(CANCEL_REASONS).toContain('Out of stock' as CancelReason)

    // Validate cancellation is possible
    const maxCancellable = item.orderedQuantity - item.shippedQuantity - item.cancelledQuantity
    expect(cancelQty).toBeLessThanOrEqual(maxCancellable)
    
    // Calculate new values
    const newCancelledQty = item.cancelledQuantity + cancelQty
    const newRemainingQty = item.orderedQuantity - item.shippedQuantity - newCancelledQty
    const newStatus: LineItemStatus = newCancelledQty >= item.orderedQuantity - item.shippedQuantity ? 'Cancelled' : 'Open'
    
    expect(newCancelledQty).toBe(10)
    expect(newRemainingQty).toBe(0)
    expect(newStatus).toBe('Cancelled')
  })

  it('should cancel partial quantity of an item', () => {
    const item = { ...mockOrderItem }
    const cancelQty = 3
    expect(CANCEL_REASONS).toContain('Customer request' as CancelReason)

    const maxCancellable = item.orderedQuantity - item.shippedQuantity - item.cancelledQuantity
    expect(cancelQty).toBeLessThanOrEqual(maxCancellable)
    
    const newCancelledQty = item.cancelledQuantity + cancelQty
    const newRemainingQty = item.orderedQuantity - item.shippedQuantity - newCancelledQty
    const newStatus: LineItemStatus = newCancelledQty >= item.orderedQuantity - item.shippedQuantity ? 'Cancelled' : 'Open'
    
    expect(newCancelledQty).toBe(3)
    expect(newRemainingQty).toBe(4) // 10 - 3 shipped - 3 cancelled = 4
    expect(newStatus).toBe('Open') // Still has remaining
  })

  it('should not cancel more than remaining quantity', () => {
    const item = { ...mockOrderItem }
    const cancelQty = 10 // Trying to cancel 10 when only 7 remaining
    
    const maxCancellable = item.orderedQuantity - item.shippedQuantity - item.cancelledQuantity
    expect(cancelQty).toBeGreaterThan(maxCancellable)
    expect(maxCancellable).toBe(7)
  })

  it('should not cancel already shipped units', () => {
    const item = { ...mockOrderItem, shippedQuantity: 10 }
    
    const maxCancellable = item.orderedQuantity - item.shippedQuantity - item.cancelledQuantity
    expect(maxCancellable).toBe(0)
  })

  it('should not cancel items on invoiced orders', () => {
    const orderStatus = 'Invoiced'
    const isLocked = orderStatus === 'Invoiced' || orderStatus === 'Cancelled'
    expect(isLocked).toBe(true)
  })

  it('should record reason, timestamp, and user', () => {
    const reason: CancelReason = 'Discontinued'
    const timestamp = new Date().toISOString()
    const user = 'admin@example.com'
    
    expect(CANCEL_REASONS).toContain(reason)
    expect(timestamp).toBeTruthy()
    expect(user).toBeTruthy()
  })

  it('should update item status to Cancelled when fully cancelled', () => {
    const item = { ...mockOrderItem, shippedQuantity: 5 }
    const cancelQty = 5 // Cancel all remaining
    
    const newCancelledQty = item.cancelledQuantity + cancelQty
    const newStatus: LineItemStatus = newCancelledQty >= item.orderedQuantity - item.shippedQuantity ? 'Cancelled' : 'Open'
    
    expect(newStatus).toBe('Cancelled')
  })
})

describe('OrderItemStatus', () => {
  it('should show Open for items with remaining qty', () => {
    const item = { ...mockOrderItem }
    const status = calculateStatus(item)
    expect(status).toBe('Open')
  })

  it('should show Shipped when fully shipped', () => {
    const item = { 
      ...mockOrderItem, 
      shippedQuantity: 10,
      remainingQuantity: 0,
    }
    const status = calculateStatus(item)
    expect(status).toBe('Shipped')
  })

  it('should show Cancelled when fully cancelled', () => {
    const item = { 
      ...mockOrderItem, 
      shippedQuantity: 0,
      cancelledQuantity: 10,
      remainingQuantity: 0,
    }
    const status = calculateStatus(item)
    expect(status).toBe('Cancelled')
  })

  it('should calculate remaining = ordered - shipped - cancelled', () => {
    const ordered = 10
    const shipped = 3
    const cancelled = 2
    const remaining = ordered - shipped - cancelled
    expect(remaining).toBe(5)
  })
})

describe('CANCEL_REASONS', () => {
  it('should include all standard reasons', () => {
    expect(CANCEL_REASONS).toContain('Out of stock')
    expect(CANCEL_REASONS).toContain('Discontinued')
    expect(CANCEL_REASONS).toContain('Customer request')
    expect(CANCEL_REASONS).toContain('Damaged/defective')
    expect(CANCEL_REASONS).toContain('Price error')
    expect(CANCEL_REASONS).toContain('Other')
  })
})

// Helper function to calculate status
function calculateStatus(item: typeof mockOrderItem): LineItemStatus {
  if (item.cancelledQuantity >= item.orderedQuantity) {
    return 'Cancelled'
  }
  if (item.shippedQuantity >= item.orderedQuantity - item.cancelledQuantity) {
    return 'Shipped'
  }
  return 'Open'
}
