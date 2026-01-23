'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import type { SkuImageConfig, ImageSource } from '@/lib/types/image-config'
import { getDefaultConfig } from '@/lib/config/image-defaults'
import {
  extractCacheKey,
  getThumbnailUrl,
  getSkuImageSrcSet,
  type ThumbnailSize,
} from '@/lib/utils/thumbnail-url'

// =============================================================================
// Types
// =============================================================================

interface ImageConfigContextValue {
  /** Get configuration for a specific location */
  getConfig: (locationId: string) => SkuImageConfig
  /** Get resolved image URL(s) for a location */
  getImageUrl: (
    locationId: string,
    thumbnailPath: string | null | undefined,
    shopifyImageUrl: string | null | undefined
  ) => {
    primaryUrl: string | null
    fallbackUrl: string | null
    srcSet: string | null
  }
  /** Whether configs have been loaded from API */
  isLoaded: boolean
  /** Whether there was an error loading configs */
  hasError: boolean
  /** Set of location IDs that have been accessed (for verification) */
  usedLocations: Set<string>
}

// =============================================================================
// Context
// =============================================================================

const ImageConfigContext = createContext<ImageConfigContextValue | null>(null)

// =============================================================================
// Utility Functions
// =============================================================================

/** Map pixel size to thumbnail size key */
function pixelSizeToThumbnailSize(pixelSize: number): ThumbnailSize {
  if (pixelSize <= 120) return 'sm'
  if (pixelSize <= 240) return 'md'
  if (pixelSize <= 480) return 'lg'
  return 'xl'
}

/** Get URL for a specific source */
function getUrlForSource(
  source: ImageSource,
  thumbnailPath: string | null | undefined,
  shopifyImageUrl: string | null | undefined,
  pixelSize: number | null
): string | null {
  switch (source) {
    case 's3_thumbnail': {
      const cacheKey = extractCacheKey(thumbnailPath ?? null)
      if (!cacheKey) return null
      const size = pixelSize ? pixelSizeToThumbnailSize(pixelSize) : 'md'
      return getThumbnailUrl(cacheKey, size)
    }
    case 'shopify_cdn':
      return shopifyImageUrl ?? null
    case 'static_file':
      // Static files would be handled differently, returning null for now
      return null
    default:
      return null
  }
}

// =============================================================================
// Provider Component
// =============================================================================

interface ImageConfigProviderProps {
  children: ReactNode
}

export function ImageConfigProvider({ children }: ImageConfigProviderProps) {
  const [configs, setConfigs] = useState<SkuImageConfig[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [usedLocations] = useState(() => new Set<string>())

  // Fetch configs on mount
  useEffect(() => {
    let cancelled = false

    async function fetchConfigs() {
      try {
        const res = await fetch('/api/image-configs')
        if (!res.ok) throw new Error('Failed to fetch')

        const data = await res.json()
        if (!cancelled) {
          setConfigs(data.configs || [])
          setIsLoaded(true)
        }
      } catch (error) {
        console.warn('[ImageConfigProvider] Failed to load configs, using defaults:', error)
        if (!cancelled) {
          setHasError(true)
          setIsLoaded(true)
        }
      }
    }

    fetchConfigs()

    return () => {
      cancelled = true
    }
  }, [])

  // Build lookup map for fast access
  const configMap = useMemo(() => {
    const map = new Map<string, SkuImageConfig>()
    for (const config of configs) {
      map.set(config.id, config)
    }
    return map
  }, [configs])

  // Get config for a location (with tracking)
  const getConfig = useCallback(
    (locationId: string): SkuImageConfig => {
      // Track that this location was accessed
      usedLocations.add(locationId)

      // Return from API configs if available
      const apiConfig = configMap.get(locationId)
      if (apiConfig) return apiConfig

      // Fall back to defaults
      return getDefaultConfig(locationId)
    },
    [configMap, usedLocations]
  )

  // Get resolved image URLs for a location
  const getImageUrl = useCallback(
    (
      locationId: string,
      thumbnailPath: string | null | undefined,
      shopifyImageUrl: string | null | undefined
    ) => {
      const config = getConfig(locationId)

      // Handle srcSet case
      if (config.useSrcSet) {
        const srcSetData = getSkuImageSrcSet(thumbnailPath, shopifyImageUrl)
        return {
          primaryUrl: srcSetData?.src ?? null,
          fallbackUrl: shopifyImageUrl ?? null,
          srcSet: srcSetData?.srcSet ?? null,
        }
      }

      // Handle single URL case
      const primaryUrl = getUrlForSource(
        config.primary,
        thumbnailPath,
        shopifyImageUrl,
        config.pixelSize
      )
      const fallbackUrl = config.fallback
        ? getUrlForSource(config.fallback, thumbnailPath, shopifyImageUrl, config.pixelSize)
        : null

      return {
        primaryUrl,
        fallbackUrl,
        srcSet: null,
      }
    },
    [getConfig]
  )

  const value: ImageConfigContextValue = {
    getConfig,
    getImageUrl,
    isLoaded,
    hasError,
    usedLocations,
  }

  return (
    <ImageConfigContext.Provider value={value}>
      {children}
    </ImageConfigContext.Provider>
  )
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access image configuration.
 * Must be used within an ImageConfigProvider.
 */
export function useImageConfig(): ImageConfigContextValue {
  const context = useContext(ImageConfigContext)
  if (!context) {
    throw new Error('useImageConfig must be used within an ImageConfigProvider')
  }
  return context
}

/**
 * Optional hook that returns null if not within provider.
 * Useful for components that may be used outside the provider.
 */
export function useImageConfigOptional(): ImageConfigContextValue | null {
  return useContext(ImageConfigContext)
}
