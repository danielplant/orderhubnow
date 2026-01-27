/**
 * Size Sort Tests
 *
 * Verifies size ordering logic for Limeapple products.
 * Tests cover:
 * - Full size range from baby months to adult letters
 * - Raw string matching (no normalization)
 * - Unknown sizes sort to the end
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  sortBySize,
  setSizeAliasCache,
  invalidateSizeAliasCache
} from '@/lib/utils/size-sort'

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

describe('alias resolution', () => {
  beforeEach(() => {
    // Set up alias cache with test data
    setSizeAliasCache([
      { raw: 'M/L - size 7 to 16', canonical: 'M/L' },
      { raw: 'XL/XXL(14-16)', canonical: 'XL' },
    ])
  })

  afterEach(() => {
    invalidateSizeAliasCache()
  })

  it('should resolve aliased sizes to their canonical form for sorting', () => {
    const items = [
      { size: 'M/L - size 7 to 16', sku: 'A' },  // Should resolve to M/L
      { size: 'S', sku: 'B' },
      { size: 'XL/XXL(14-16)', sku: 'C' },        // Should resolve to XL
    ]
    const sorted = sortBySize(items)
    expect(sorted.map(i => i.size)).toEqual(['S', 'M/L - size 7 to 16', 'XL/XXL(14-16)'])
  })

  it('should handle aliased size mixed with canonical sizes', () => {
    const items = [
      { size: 'XL', sku: 'A' },
      { size: 'M/L - size 7 to 16', sku: 'B' },  // Alias for M/L
      { size: 'M/L', sku: 'C' },                  // Direct canonical
    ]
    const sorted = sortBySize(items)
    // Both M/L variants should sort together (M/L position), before XL
    expect(sorted.map(i => i.size)).toEqual(['M/L - size 7 to 16', 'M/L', 'XL'])
  })
})

describe('orphaned alias handling', () => {
  beforeEach(() => {
    // Set up alias pointing to a canonical that doesn't exist in the default order
    setSizeAliasCache([
      { raw: 'Weird-Size', canonical: 'NonExistent' },
    ])
  })

  afterEach(() => {
    invalidateSizeAliasCache()
  })

  it('should sort orphaned aliases to the end', () => {
    const items = [
      { size: 'S', sku: 'A' },
      { size: 'Weird-Size', sku: 'B' },  // Alias to "NonExistent" which isn't in order
      { size: 'M', sku: 'C' },
    ]
    const sorted = sortBySize(items)
    // Orphaned alias should be at the end (index 9999)
    expect(sorted.map(i => i.size)).toEqual(['S', 'M', 'Weird-Size'])
  })

  // Note: console.warn logging is verified manually via stderr output in test runs.
  // The module captures console at import time, making it difficult to mock in tests.
  // The behavioral test above ("should sort orphaned aliases to the end") verifies
  // the important functionality - orphaned aliases sort to position 9999 (end).
})
