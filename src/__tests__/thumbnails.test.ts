/**
 * Thumbnail Caching Tests
 *
 * Verifies the content-hash based thumbnail caching system.
 * Tests cover:
 * - Cache key generation (deterministic, version-sensitive)
 * - Cache key extraction from paths
 * - Thumbnail status checking (cache hit/miss detection)
 * - Settings version invalidation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import {
  generateThumbnailCacheKey,
  extractCacheKey,
  checkThumbnailStatus,
  THUMBNAIL_SETTINGS_VERSION,
  THUMBNAIL_CONFIG,
  THUMBNAIL_SIZES,
} from '@/lib/utils/thumbnails'

// Note: S3 storage implementation doesn't require fs mocks
// checkThumbnailStatus trusts the DB cache key without filesystem checks

describe('THUMBNAIL_CONFIG', () => {
  it('should have expected default configuration', () => {
    expect(THUMBNAIL_SIZES.sm).toBe(120)
    expect(THUMBNAIL_SIZES.md).toBe(240)
    expect(THUMBNAIL_SIZES.lg).toBe(480)
    expect(THUMBNAIL_CONFIG.quality).toBe(80)
    expect(THUMBNAIL_CONFIG.fit).toBe('contain')
    expect(THUMBNAIL_CONFIG.background).toEqual({ r: 255, g: 255, b: 255, alpha: 1 })
  })

  it('should have a defined settings version', () => {
    expect(typeof THUMBNAIL_SETTINGS_VERSION).toBe('number')
    expect(THUMBNAIL_SETTINGS_VERSION).toBeGreaterThan(0)
  })
})

describe('generateThumbnailCacheKey', () => {
  it('should generate a 16-character hex string', () => {
    const key = generateThumbnailCacheKey('https://example.com/image.jpg')
    expect(key).toHaveLength(16)
    expect(key).toMatch(/^[a-f0-9]{16}$/)
  })

  it('should be deterministic - same input yields same output', () => {
    const url = 'https://cdn.shopify.com/s/files/1/image.jpg'
    const key1 = generateThumbnailCacheKey(url)
    const key2 = generateThumbnailCacheKey(url)
    const key3 = generateThumbnailCacheKey(url)

    expect(key1).toBe(key2)
    expect(key2).toBe(key3)
  })

  it('should produce different keys for different URLs', () => {
    const key1 = generateThumbnailCacheKey('https://example.com/image1.jpg')
    const key2 = generateThumbnailCacheKey('https://example.com/image2.jpg')

    expect(key1).not.toBe(key2)
  })

  it('should produce different keys when URL query params change', () => {
    const key1 = generateThumbnailCacheKey('https://example.com/image.jpg?v=1')
    const key2 = generateThumbnailCacheKey('https://example.com/image.jpg?v=2')

    expect(key1).not.toBe(key2)
  })

  it('should include settings version in hash calculation', () => {
    // Verify the hash input format includes version
    const url = 'https://example.com/image.jpg'
    const expectedInput = `${url}|v${THUMBNAIL_SETTINGS_VERSION}`
    const expectedHash = crypto.createHash('sha256').update(expectedInput).digest('hex').slice(0, 16)

    const actualKey = generateThumbnailCacheKey(url)
    expect(actualKey).toBe(expectedHash)
  })

  it('should handle URLs with special characters', () => {
    const url = 'https://example.com/image (1).jpg?name=test&size=large'
    const key = generateThumbnailCacheKey(url)

    expect(key).toHaveLength(16)
    expect(key).toMatch(/^[a-f0-9]{16}$/)
  })

  it('should handle empty URL gracefully', () => {
    const key = generateThumbnailCacheKey('')
    expect(key).toHaveLength(16)
    expect(key).toMatch(/^[a-f0-9]{16}$/)
  })
})

describe('extractCacheKey', () => {
  it('should extract cache key from valid thumbnail path', () => {
    const key = extractCacheKey('/thumbnails/abc123def456abc1.png')
    expect(key).toBe('abc123def456abc1')
  })

  it('should return null for null input', () => {
    expect(extractCacheKey(null)).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(extractCacheKey('')).toBeNull()
  })

  it('should return null for paths not matching expected format', () => {
    // Wrong extension
    expect(extractCacheKey('/thumbnails/abc123def456abc1.jpg')).toBeNull()

    // Wrong directory
    expect(extractCacheKey('/images/abc123def456abc1.png')).toBeNull()

    // Wrong key length (too short)
    expect(extractCacheKey('/thumbnails/abc123.png')).toBeNull()

    // Wrong key length (too long)
    expect(extractCacheKey('/thumbnails/abc123def456abc1abc2.png')).toBeNull()

    // Invalid characters in key
    expect(extractCacheKey('/thumbnails/abc123def456abc!.png')).toBeNull()
  })

  it('should handle legacy SKU-based paths by returning null', () => {
    // Legacy format used SKU ID with underscores
    expect(extractCacheKey('/thumbnails/744-MU-7_8.png')).toBeNull()
    expect(extractCacheKey('/thumbnails/LULU_FC_2T.png')).toBeNull()
  })

  it('should extract key regardless of full path prefix', () => {
    expect(extractCacheKey('/thumbnails/1234567890abcdef.png')).toBe('1234567890abcdef')
    expect(extractCacheKey('/public/thumbnails/1234567890abcdef.png')).toBe('1234567890abcdef')
  })
})

describe('checkThumbnailStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should return needsRegen=false when no image URL provided', () => {
    const status = checkThumbnailStatus(null, '/thumbnails/abc123.png')

    expect(status.needsRegen).toBe(false)
    expect(status.reason).toBe('No image URL provided')
    expect(status.expectedCacheKey).toBeNull()
  })

  it('should return needsRegen=true when no current thumbnail path', () => {
    const status = checkThumbnailStatus('https://example.com/image.jpg', null)

    expect(status.needsRegen).toBe(true)
    expect(status.reason).toBe('No existing thumbnail')
    expect(status.expectedCacheKey).not.toBeNull()
  })

  it('should return needsRegen=true when current path is empty string', () => {
    const status = checkThumbnailStatus('https://example.com/image.jpg', '')

    expect(status.needsRegen).toBe(true)
    expect(status.reason).toBe('No existing thumbnail')
  })

  it('should return needsRegen=true when cache keys do not match', () => {
    const imageUrl = 'https://example.com/image.jpg'
    const expectedKey = generateThumbnailCacheKey(imageUrl)
    // Use a valid 16-char hex key that doesn't match
    const wrongKey = 'aaaa1111bbbb2222'

    const status = checkThumbnailStatus(imageUrl, `/thumbnails/${wrongKey}.png`)

    expect(status.needsRegen).toBe(true)
    expect(status.reason).toContain('Cache key mismatch')
    expect(status.reason).toContain(wrongKey)
    expect(status.reason).toContain(expectedKey)
  })

  it('should return needsRegen=false when cache key matches (S3 storage trusts DB)', () => {
    // With S3 storage, we trust that if the cache key matches, the files exist in S3
    // No filesystem check is performed
    const imageUrl = 'https://example.com/image.jpg'
    const cacheKey = generateThumbnailCacheKey(imageUrl)

    const status = checkThumbnailStatus(imageUrl, `/thumbnails/${cacheKey}.png`)

    expect(status.needsRegen).toBe(false)
    expect(status.reason).toBe('Cache hit - thumbnail up to date')
    expect(status.expectedCacheKey).toBe(cacheKey)
  })

  it('should return needsRegen=false when cache key matches (new format - cache key only)', () => {
    const imageUrl = 'https://example.com/image.jpg'
    const cacheKey = generateThumbnailCacheKey(imageUrl)

    // New format: just the cache key, no path
    const status = checkThumbnailStatus(imageUrl, cacheKey)

    expect(status.needsRegen).toBe(false)
    expect(status.reason).toBe('Cache hit - thumbnail up to date')
    expect(status.expectedCacheKey).toBe(cacheKey)
  })

  it('should detect when URL changes require regeneration', () => {
    const oldUrl = 'https://example.com/old-image.jpg'
    const newUrl = 'https://example.com/new-image.jpg'
    const oldCacheKey = generateThumbnailCacheKey(oldUrl)

    // Thumbnail was generated from old URL
    const status = checkThumbnailStatus(newUrl, `/thumbnails/${oldCacheKey}.png`)

    expect(status.needsRegen).toBe(true)
    expect(status.reason).toContain('Cache key mismatch')
  })
})

describe('Cache invalidation scenarios', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should invalidate when image URL query param changes (Shopify versioning)', () => {
    const url1 = 'https://cdn.shopify.com/image.jpg?v=1704067200'
    const url2 = 'https://cdn.shopify.com/image.jpg?v=1704153600'

    const key1 = generateThumbnailCacheKey(url1)
    const key2 = generateThumbnailCacheKey(url2)

    expect(key1).not.toBe(key2)
  })

  it('should invalidate when domain changes', () => {
    const url1 = 'https://cdn1.shopify.com/image.jpg'
    const url2 = 'https://cdn2.shopify.com/image.jpg'

    const key1 = generateThumbnailCacheKey(url1)
    const key2 = generateThumbnailCacheKey(url2)

    expect(key1).not.toBe(key2)
  })

  it('should handle protocol changes', () => {
    // In practice Shopify always uses https, but testing edge case
    const url1 = 'http://example.com/image.jpg'
    const url2 = 'https://example.com/image.jpg'

    const key1 = generateThumbnailCacheKey(url1)
    const key2 = generateThumbnailCacheKey(url2)

    expect(key1).not.toBe(key2)
  })
})

describe('Deduplication behavior', () => {
  it('should generate same key for identical URLs used by different SKUs', () => {
    // This tests the deduplication feature - if multiple SKUs share the same image URL,
    // they should all point to the same thumbnail file
    const sharedImageUrl = 'https://cdn.shopify.com/shared-product-image.jpg'

    // Simulate two different SKUs using the same image
    const key1 = generateThumbnailCacheKey(sharedImageUrl)
    const key2 = generateThumbnailCacheKey(sharedImageUrl)

    expect(key1).toBe(key2)
  })
})

describe('Settings version changes', () => {
  it('should document current settings version', () => {
    // This test serves as documentation and will fail if version changes
    // Update this test when THUMBNAIL_SETTINGS_VERSION is bumped
    expect(THUMBNAIL_SETTINGS_VERSION).toBe(3)
  })

  it('should produce different keys when version would change', () => {
    // Simulate what would happen if we bumped the version
    const url = 'https://example.com/image.jpg'
    const currentKey = generateThumbnailCacheKey(url)

    // Manually calculate what key would be with different version
    const hypotheticalVersion = THUMBNAIL_SETTINGS_VERSION + 1
    const hypotheticalInput = `${url}|v${hypotheticalVersion}`
    const hypotheticalKey = crypto.createHash('sha256').update(hypotheticalInput).digest('hex').slice(0, 16)

    expect(currentKey).not.toBe(hypotheticalKey)
  })
})

describe('Edge cases', () => {
  it('should handle very long URLs', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(1000) + '.jpg'
    const key = generateThumbnailCacheKey(longUrl)

    expect(key).toHaveLength(16)
    expect(key).toMatch(/^[a-f0-9]{16}$/)
  })

  it('should handle unicode characters in URL', () => {
    const unicodeUrl = 'https://example.com/图片.jpg'
    const key = generateThumbnailCacheKey(unicodeUrl)

    expect(key).toHaveLength(16)
    expect(key).toMatch(/^[a-f0-9]{16}$/)
  })

  it('should handle URLs with encoded characters', () => {
    const encodedUrl = 'https://example.com/image%20file%20(1).jpg'
    const key = generateThumbnailCacheKey(encodedUrl)

    expect(key).toHaveLength(16)
    expect(key).toMatch(/^[a-f0-9]{16}$/)
  })
})
