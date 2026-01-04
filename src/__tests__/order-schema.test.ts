import { describe, it, expect } from 'vitest'
import { orderFormSchema, createOrderInputSchema } from '@/lib/schemas/order'

describe('orderFormSchema', () => {
  const validFormData = {
    storeName: 'Test Store',
    buyerName: 'John Doe',
    salesRep: 'Jane Smith',
    customerPhone: '555-555-5555',
    customerEmail: 'buyer@store.com',
    website: '',
    street1: '123 Main St',
    street2: '',
    city: 'Toronto',
    stateProvince: 'ON',
    zipPostal: 'M5V 2A1',
    country: 'Canada' as const,
    shippingStreet1: '456 Ship St',
    shippingStreet2: '',
    shippingCity: 'Toronto',
    shippingStateProvince: 'ON',
    shippingZipPostal: 'M5V 2A1',
    shippingCountry: 'Canada' as const,
    shipStartDate: '2026-02-01',
    shipEndDate: '2026-02-28',
    customerPO: 'PO-12345',
    orderNotes: 'Please deliver before noon',
  }

  it('should validate valid form data', () => {
    const result = orderFormSchema.safeParse(validFormData)
    expect(result.success).toBe(true)
  })

  it('should require store name', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, storeName: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('storeName')
    }
  })

  it('should require buyer name', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, buyerName: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('buyerName')
    }
  })

  it('should require sales rep', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, salesRep: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('salesRep')
    }
  })

  it('should require valid email', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, customerEmail: 'invalid-email' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('customerEmail')
    }
  })

  it('should validate state/province max length', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, stateProvince: 'TOOLONG' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('stateProvince')
    }
  })

  it('should only accept USA or Canada for country', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, country: 'Mexico' })
    expect(result.success).toBe(false)
  })

  it('should validate ship end date is after start date', () => {
    const result = orderFormSchema.safeParse({
      ...validFormData,
      shipStartDate: '2026-03-01',
      shipEndDate: '2026-02-01',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('shipEndDate')
    }
  })

  it('should allow optional website', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, website: '' })
    expect(result.success).toBe(true)
  })

  it('should validate website URL when provided', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, website: 'https://store.com' })
    expect(result.success).toBe(true)
  })

  it('should reject invalid website URL', () => {
    const result = orderFormSchema.safeParse({ ...validFormData, website: 'not-a-url' })
    expect(result.success).toBe(false)
  })
})

describe('createOrderInputSchema', () => {
  const validInput = {
    storeName: 'Test Store',
    buyerName: 'John Doe',
    salesRep: 'Jane Smith',
    customerPhone: '555-555-5555',
    customerEmail: 'buyer@store.com',
    website: '',
    street1: '123 Main St',
    street2: '',
    city: 'Toronto',
    stateProvince: 'ON',
    zipPostal: 'M5V 2A1',
    country: 'Canada' as const,
    shippingStreet1: '456 Ship St',
    shippingStreet2: '',
    shippingCity: 'Toronto',
    shippingStateProvince: 'ON',
    shippingZipPostal: 'M5V 2A1',
    shippingCountry: 'Canada' as const,
    shipStartDate: '2026-02-01',
    shipEndDate: '2026-02-28',
    customerPO: 'PO-12345',
    orderNotes: '',
    currency: 'CAD' as const,
    items: [
      { sku: 'SKU-001', skuVariantId: 12345, quantity: 5, price: 29.99 },
      { sku: 'SKU-002', skuVariantId: 12346, quantity: 3, price: 49.99 },
    ],
    isPreOrder: false,
  }

  it('should validate valid order input', () => {
    const result = createOrderInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('should require at least one item', () => {
    const result = createOrderInputSchema.safeParse({ ...validInput, items: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('items')
    }
  })

  it('should validate item quantity is positive', () => {
    const result = createOrderInputSchema.safeParse({
      ...validInput,
      items: [{ sku: 'SKU-001', skuVariantId: 12345, quantity: 0, price: 29.99 }],
    })
    expect(result.success).toBe(false)
  })

  it('should validate item price is non-negative', () => {
    const result = createOrderInputSchema.safeParse({
      ...validInput,
      items: [{ sku: 'SKU-001', skuVariantId: 12345, quantity: 1, price: -5 }],
    })
    expect(result.success).toBe(false)
  })

  it('should only accept USD or CAD for currency', () => {
    const result = createOrderInputSchema.safeParse({ ...validInput, currency: 'EUR' })
    expect(result.success).toBe(false)
  })

  it('should accept boolean isPreOrder flag', () => {
    const resultATS = createOrderInputSchema.safeParse({ ...validInput, isPreOrder: false })
    expect(resultATS.success).toBe(true)

    const resultPreOrder = createOrderInputSchema.safeParse({ ...validInput, isPreOrder: true })
    expect(resultPreOrder.success).toBe(true)
  })
})
