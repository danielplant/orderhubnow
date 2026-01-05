import { describe, it, expect } from 'vitest'

/**
 * Unit tests for draft link generation and restoration.
 * These test the core encoding/decoding logic used by the OrderContext.
 */

// Helper to simulate the encoding logic from order-context.tsx
function encodeDraftData(data: {
  orders: Record<string, Record<string, number>>
  prices: Record<string, number>
  preOrderMeta?: Record<string, unknown>
  lineMeta?: Record<string, unknown>
}): string {
  return btoa(encodeURIComponent(JSON.stringify(data)))
}

// Helper to simulate the decoding logic from order-context.tsx
function decodeDraftData(encoded: string): {
  orders: Record<string, Record<string, number>>
  prices: Record<string, number>
  preOrderMeta?: Record<string, unknown>
  lineMeta?: Record<string, unknown>
} | null {
  try {
    const decoded = JSON.parse(decodeURIComponent(atob(encoded)))
    if (decoded.orders && typeof decoded.orders === 'object') {
      return decoded
    }
    return null
  } catch {
    return null
  }
}

describe('Draft Link Encoding', () => {
  const sampleCartData = {
    orders: {
      'product-1': { 'SKU-001': 5, 'SKU-002': 3 },
      'product-2': { 'SKU-003': 2 },
    },
    prices: {
      'SKU-001': 29.99,
      'SKU-002': 39.99,
      'SKU-003': 49.99,
    },
    preOrderMeta: {
      'SKU-001': {
        categoryId: 1,
        categoryName: 'Test Category',
        onRouteStart: '2026-03-01',
        onRouteEnd: '2026-03-15',
      },
    },
    lineMeta: {
      'SKU-001': { isOnRoute: true },
      'SKU-002': { isOnRoute: false },
    },
  }

  it('should encode cart data to a valid base64 string', () => {
    const encoded = encodeDraftData(sampleCartData)
    expect(typeof encoded).toBe('string')
    expect(encoded.length).toBeGreaterThan(0)
    // Should not contain URL-unsafe characters after base64 encoding
    expect(encoded).not.toContain(' ')
  })

  it('should decode encoded data back to original', () => {
    const encoded = encodeDraftData(sampleCartData)
    const decoded = decodeDraftData(encoded)

    expect(decoded).not.toBeNull()
    expect(decoded?.orders).toEqual(sampleCartData.orders)
    expect(decoded?.prices).toEqual(sampleCartData.prices)
    expect(decoded?.preOrderMeta).toEqual(sampleCartData.preOrderMeta)
    expect(decoded?.lineMeta).toEqual(sampleCartData.lineMeta)
  })

  it('should handle empty cart', () => {
    const emptyCart = {
      orders: {},
      prices: {},
    }
    const encoded = encodeDraftData(emptyCart)
    const decoded = decodeDraftData(encoded)

    expect(decoded).not.toBeNull()
    expect(decoded?.orders).toEqual({})
  })

  it('should handle special characters in product names', () => {
    const cartWithSpecialChars = {
      orders: {
        'product-with-émojis-🎉': { 'SKU-SPECIAL': 1 },
        'café-☕': { 'SKU-COFFEE': 2 },
      },
      prices: {
        'SKU-SPECIAL': 99.99,
        'SKU-COFFEE': 15.00,
      },
    }

    const encoded = encodeDraftData(cartWithSpecialChars)
    const decoded = decodeDraftData(encoded)

    expect(decoded).not.toBeNull()
    expect(decoded?.orders['product-with-émojis-🎉']).toEqual({ 'SKU-SPECIAL': 1 })
    expect(decoded?.orders['café-☕']).toEqual({ 'SKU-COFFEE': 2 })
  })

  it('should handle large quantities', () => {
    const largeCart = {
      orders: {
        'product-1': { 'SKU-001': 999999 },
      },
      prices: {
        'SKU-001': 0.01,
      },
    }

    const encoded = encodeDraftData(largeCart)
    const decoded = decodeDraftData(encoded)

    expect(decoded?.orders['product-1']['SKU-001']).toBe(999999)
  })

  it('should handle decimal prices with precision', () => {
    const precisionCart = {
      orders: {
        'product-1': { 'SKU-001': 1 },
      },
      prices: {
        'SKU-001': 29.99,
      },
    }

    const encoded = encodeDraftData(precisionCart)
    const decoded = decodeDraftData(encoded)

    expect(decoded?.prices['SKU-001']).toBe(29.99)
  })
})

describe('Draft Link Decoding - Error Cases', () => {
  it('should return null for invalid base64', () => {
    const result = decodeDraftData('not-valid-base64!!!')
    expect(result).toBeNull()
  })

  it('should return null for valid base64 but invalid JSON', () => {
    const invalidJson = btoa('this is not json')
    const result = decodeDraftData(invalidJson)
    expect(result).toBeNull()
  })

  it('should return null when orders property is missing', () => {
    const noOrders = btoa(encodeURIComponent(JSON.stringify({ prices: { 'SKU-001': 10 } })))
    const result = decodeDraftData(noOrders)
    expect(result).toBeNull()
  })

  it('should return null when orders is not an object', () => {
    const invalidOrders = btoa(encodeURIComponent(JSON.stringify({ orders: 'not an object' })))
    const result = decodeDraftData(invalidOrders)
    expect(result).toBeNull()
  })

  it('should return null for empty string', () => {
    const result = decodeDraftData('')
    expect(result).toBeNull()
  })

  it('should return null for malformed encoded data', () => {
    // This is valid base64 but the URI decoding will fail
    const malformed = btoa('%invalid-uri-encoding%')
    const result = decodeDraftData(malformed)
    expect(result).toBeNull()
  })
})

describe('Draft Link URL Generation', () => {
  const baseUrl = 'https://orderhubnow.com'

  function generateDraftUrl(
    orders: Record<string, Record<string, number>>,
    prices: Record<string, number>
  ): string | null {
    if (Object.keys(orders).length === 0) return null

    try {
      const data = { orders, prices }
      const encoded = btoa(encodeURIComponent(JSON.stringify(data)))
      return `${baseUrl}/buyer/my-order?draft=${encoded}`
    } catch {
      return null
    }
  }

  it('should return null for empty cart', () => {
    const result = generateDraftUrl({}, {})
    expect(result).toBeNull()
  })

  it('should generate valid URL with draft parameter', () => {
    const url = generateDraftUrl(
      { 'product-1': { 'SKU-001': 5 } },
      { 'SKU-001': 29.99 }
    )

    expect(url).not.toBeNull()
    expect(url).toContain('/buyer/my-order?draft=')
    expect(url?.startsWith(baseUrl)).toBe(true)
  })

  it('should generate URL that can be decoded', () => {
    const orders = { 'product-1': { 'SKU-001': 5, 'SKU-002': 3 } }
    const prices = { 'SKU-001': 29.99, 'SKU-002': 39.99 }

    const url = generateDraftUrl(orders, prices)
    expect(url).not.toBeNull()

    // Extract draft parameter
    const draftParam = new URL(url!).searchParams.get('draft')
    expect(draftParam).not.toBeNull()

    // Decode and verify
    const decoded = decodeDraftData(draftParam!)
    expect(decoded?.orders).toEqual(orders)
    expect(decoded?.prices).toEqual(prices)
  })
})

describe('Draft Link Roundtrip', () => {
  it('should preserve all cart data through encode/decode cycle', () => {
    const originalData = {
      orders: {
        'product-abc': { 'SKU-A': 10, 'SKU-B': 5 },
        'product-xyz': { 'SKU-X': 1 },
      },
      prices: {
        'SKU-A': 25.00,
        'SKU-B': 30.50,
        'SKU-X': 99.99,
      },
      preOrderMeta: {
        'SKU-A': {
          categoryId: 42,
          categoryName: 'Spring 2026',
          onRouteStart: '2026-04-01',
          onRouteEnd: '2026-04-15',
        },
      },
      lineMeta: {
        'SKU-A': { isOnRoute: true },
        'SKU-B': { isOnRoute: false },
      },
    }

    const encoded = encodeDraftData(originalData)
    const decoded = decodeDraftData(encoded)

    expect(decoded).toEqual(originalData)
  })

  it('should work with many products', () => {
    const orders: Record<string, Record<string, number>> = {}
    const prices: Record<string, number> = {}

    // Create 50 products with 5 SKUs each
    for (let i = 0; i < 50; i++) {
      orders[`product-${i}`] = {}
      for (let j = 0; j < 5; j++) {
        const sku = `SKU-${i}-${j}`
        orders[`product-${i}`][sku] = Math.floor(Math.random() * 100) + 1
        prices[sku] = Math.random() * 100
      }
    }

    const data = { orders, prices }
    const encoded = encodeDraftData(data)
    const decoded = decodeDraftData(encoded)

    expect(decoded?.orders).toEqual(orders)
    expect(Object.keys(decoded?.orders || {})).toHaveLength(50)
  })
})
