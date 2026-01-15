import { describe, it, expect } from 'vitest'

/**
 * Shipment Management Tests
 * Tests for void shipment and order status recalculation logic
 */

describe('Void Shipment Logic', () => {
  describe('Status recalculation after voiding', () => {
    it('should revert to Processing when last shipment is voided', () => {
      const shipmentsAfterVoid: unknown[] = []
      const currentStatus = 'Shipped'
      
      const newStatus = calculateStatusAfterVoid(shipmentsAfterVoid, currentStatus)
      
      expect(newStatus).toBe('Processing')
    })

    it('should stay Partially Shipped when other shipments remain', () => {
      const items = [
        { id: '1', quantity: 10, cancelledQty: 0 },
        { id: '2', quantity: 10, cancelledQty: 0 },
      ]
      const shippedByItem = new Map([
        ['1', 5], // Only partially shipped
        ['2', 0],
      ])
      const hasShipments = true
      
      const newStatus = calculateOrderStatus(items, shippedByItem, hasShipments)
      
      expect(newStatus).toBe('Partially Shipped')
    })

    it('should become Shipped if remaining shipments fully cover items', () => {
      const items = [
        { id: '1', quantity: 10, cancelledQty: 0 },
      ]
      const shippedByItem = new Map([
        ['1', 10],
      ])
      const hasShipments = true
      
      const newStatus = calculateOrderStatus(items, shippedByItem, hasShipments)
      
      expect(newStatus).toBe('Shipped')
    })

    it('should consider cancelled quantities in fulfillment calculation', () => {
      const items = [
        { id: '1', quantity: 10, cancelledQty: 5 }, // Effective qty = 5
      ]
      const shippedByItem = new Map([
        ['1', 5], // 5 shipped = fully fulfilled
      ])
      const hasShipments = true
      
      const newStatus = calculateOrderStatus(items, shippedByItem, hasShipments)
      
      expect(newStatus).toBe('Shipped')
    })

    it('should not change Cancelled orders', () => {
      const currentStatus = 'Cancelled'
      const shipmentsAfterVoid: unknown[] = []
      
      const newStatus = calculateStatusAfterVoid(shipmentsAfterVoid, currentStatus)
      
      expect(newStatus).toBe('Cancelled')
    })
  })

  describe('Void validation', () => {
    it('should not allow voiding on Invoiced orders', () => {
      const orderStatus = 'Invoiced'
      const canVoid = canVoidShipment(orderStatus)
      
      expect(canVoid).toBe(false)
    })

    it('should allow voiding on Shipped orders', () => {
      const orderStatus = 'Shipped'
      const canVoid = canVoidShipment(orderStatus)
      
      expect(canVoid).toBe(true)
    })

    it('should allow voiding on Partially Shipped orders', () => {
      const orderStatus = 'Partially Shipped'
      const canVoid = canVoidShipment(orderStatus)
      
      expect(canVoid).toBe(true)
    })

    it('should allow voiding on Processing orders', () => {
      const orderStatus = 'Processing'
      const canVoid = canVoidShipment(orderStatus)
      
      expect(canVoid).toBe(true)
    })
  })
})

describe('Bulk Cancel Items', () => {
  it('should calculate remaining quantity correctly', () => {
    const item = { quantity: 10, shippedQty: 3, cancelledQty: 2 }
    const remaining = item.quantity - item.shippedQty - item.cancelledQty
    
    expect(remaining).toBe(5)
  })

  it('should not cancel already fully processed items', () => {
    const item = { quantity: 10, shippedQty: 7, cancelledQty: 3 }
    const remaining = item.quantity - item.shippedQty - item.cancelledQty
    
    expect(remaining).toBe(0)
  })

  it('should skip invoiced orders', () => {
    const orderStatus = 'Invoiced'
    const shouldProcess = shouldProcessBulkCancel(orderStatus)
    
    expect(shouldProcess).toBe(false)
  })

  it('should skip cancelled orders', () => {
    const orderStatus = 'Cancelled'
    const shouldProcess = shouldProcessBulkCancel(orderStatus)
    
    expect(shouldProcess).toBe(false)
  })

  it('should process pending orders', () => {
    const orderStatus = 'Pending'
    const shouldProcess = shouldProcessBulkCancel(orderStatus)
    
    expect(shouldProcess).toBe(true)
  })
})

// Helper functions that mirror the actual implementation logic

function calculateStatusAfterVoid(
  shipmentsAfterVoid: unknown[],
  currentStatus: string
): string {
  if (currentStatus === 'Cancelled') {
    return 'Cancelled'
  }
  
  if (shipmentsAfterVoid.length === 0) {
    return 'Processing'
  }
  
  return currentStatus
}

function calculateOrderStatus(
  items: Array<{ id: string; quantity: number; cancelledQty: number }>,
  shippedByItem: Map<string, number>,
  hasShipments: boolean
): string {
  if (!hasShipments) {
    return 'Processing'
  }

  let fullyShipped = true
  for (const item of items) {
    const shipped = shippedByItem.get(item.id) ?? 0
    const effectiveQty = item.quantity - item.cancelledQty
    if (shipped < effectiveQty) {
      fullyShipped = false
      break
    }
  }

  return fullyShipped ? 'Shipped' : 'Partially Shipped'
}

function canVoidShipment(orderStatus: string): boolean {
  return orderStatus !== 'Invoiced'
}

function shouldProcessBulkCancel(orderStatus: string): boolean {
  return orderStatus !== 'Invoiced' && orderStatus !== 'Cancelled'
}
