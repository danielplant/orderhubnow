/**
 * Size Sort Tests
 *
 * Verifies size ordering logic for Limeapple products.
 * Tests cover:
 * - Full size range from baby months to adult letters
 * - Raw string matching (no normalization)
 * - Unknown sizes sort to the end
 */

import { describe, it, expect } from 'vitest'
import { sortBySize } from '@/lib/utils/size-sort'

describe('sortBySize', () => {
  it('should sort baby month sizes correctly', () => {
    const items = [
      { size: '12/18M', sku: 'A' },
      { size: '0/6M', sku: 'B' },
      { size: '18/24M', sku: 'C' },
      { size: '6/12M', sku: 'D' },
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['0/6M', '6/12M', '12/18M', '18/24M'])
  })

  it('should sort toddler sizes correctly', () => {
    const items = [
      { size: '3T', sku: 'A' },
      { size: '2T', sku: 'B' },
      { size: '2/3', sku: 'C' },
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['2T', '3T', '2/3'])
  })

  it('should sort kids numeric sizes correctly', () => {
    const items = [
      { size: '7/8', sku: 'A' },
      { size: '5/6', sku: 'B' },
      { size: '6/7', sku: 'C' },
      { size: '10/12', sku: 'D' },
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['5/6', '6/7', '7/8', '10/12'])
  })

  it('should sort letter sizes correctly including XXS and XXL', () => {
    const items = [
      { size: 'L', sku: 'A' },
      { size: 'XXS', sku: 'B' },
      { size: 'M', sku: 'C' },
      { size: 'XXL', sku: 'D' },
      { size: 'XS', sku: 'E' },
      { size: 'S', sku: 'F' },
      { size: 'XL', sku: 'G' },
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'])
  })

  it('should sort mixed baby/toddler/kids sizes correctly', () => {
    const items = [
      { size: '2T', sku: 'A' },
      { size: '6/12M', sku: 'B' },
      { size: '4', sku: 'C' },
      { size: '18/24M', sku: 'D' },
      { size: '3T', sku: 'E' },
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['6/12M', '18/24M', '2T', '3T', '4'])
  })

  it('should be case-insensitive when matching sizes', () => {
    const items = [
      { size: 'l', sku: 'A' },
      { size: 's', sku: 'B' },
      { size: 'm', sku: 'C' },
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['s', 'm', 'l'])
  })

  it('should put unknown sizes at the end', () => {
    const items = [
      { size: 'M', sku: 'A' },
      { size: 'UNKNOWN-SIZE', sku: 'B' },
      { size: 'S', sku: 'C' },
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['S', 'M', 'UNKNOWN-SIZE'])
  })

  it('should handle empty sizes by putting them at the end', () => {
    const items = [
      { size: 'M', sku: 'A' },
      { size: '', sku: 'B' },
      { size: 'S', sku: 'C' },
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['S', 'M', ''])
  })

  it('should not mutate the original array', () => {
    const items = [
      { size: 'L', sku: 'A' },
      { size: 'S', sku: 'B' },
    ]
    const originalOrder = [...items]
    sortBySize(items)
    expect(items).toEqual(originalOrder)
  })
})
