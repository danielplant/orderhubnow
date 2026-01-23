'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { GripVertical, Calendar, EyeOff } from 'lucide-react'
import type { CollectionWithCount } from '@/lib/types/collection'
import { useImageConfig } from '@/lib/contexts'

// Default fallback image (Limeapple logo)
const FALLBACK_IMAGE = '/logos/limeapple-logo.png'

interface CollectionCardProps {
  collection: CollectionWithCount
  onClick: () => void
}

export function CollectionCard({ collection, onClick }: CollectionCardProps) {
  const [primaryError, setPrimaryError] = useState(false)
  const [fallbackError, setFallbackError] = useState(false)
  const { getImageUrl } = useImageConfig()

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const shipStart = formatDate(collection.shipWindowStart)
  const shipEnd = formatDate(collection.shipWindowEnd)
  const hasShipWindow = shipStart && shipEnd
  const isHidden = collection.isActive === false

  // Get image URLs from config
  // Note: Collections don't have thumbnailPath like SKUs do, so we pass null
  const { primaryUrl, fallbackUrl } = useMemo(
    () => getImageUrl('admin_collection_card', null, collection.imageUrl),
    [getImageUrl, collection.imageUrl]
  )

  // Determine what to show: primary → fallback → static fallback
  const showPrimary = primaryUrl && !primaryError
  const showFallback = !showPrimary && fallbackUrl && !fallbackError
  const imageSrc = showPrimary ? primaryUrl : showFallback ? fallbackUrl : FALLBACK_IMAGE
  const useStaticFallback = !showPrimary && !showFallback

  return (
    <div
      onClick={onClick}
      className={`group relative bg-card border border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-md transition-all ${
        isHidden ? 'opacity-50' : ''
      }`}
    >
      {/* Drag handle */}
      <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="p-1 bg-background/80 rounded cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Hidden badge */}
      {isHidden && (
        <div className="absolute top-2 right-2 z-10">
          <div className="flex items-center gap-1 px-2 py-1 bg-muted/90 rounded text-xs text-muted-foreground">
            <EyeOff className="h-3 w-3" />
            Hidden
          </div>
        </div>
      )}

      {/* Image */}
      <div className="relative aspect-[16/9] bg-muted flex items-center justify-center">
        <Image
          src={imageSrc}
          alt={collection.name}
          fill
          className={useStaticFallback ? 'object-contain p-4' : 'object-cover'}
          unoptimized
          onError={() => {
            if (showPrimary) setPrimaryError(true)
            else if (showFallback) setFallbackError(true)
          }}
        />
      </div>

      {/* Content - Fixed height for uniformity */}
      <div className="p-3 h-[72px] flex flex-col justify-between">
        <h4 className="font-medium text-sm line-clamp-2">{collection.name}</h4>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{collection.skuCount} SKUs</span>
          {hasShipWindow && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {shipStart} - {shipEnd}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
