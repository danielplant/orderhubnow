'use client'

import Link from 'next/link'
import { ArrowLeft, User } from 'lucide-react'
import { getPortalReturnLabel } from '@/lib/utils/rep-context'

interface RepContextBannerProps {
  repName: string | null
  returnTo: string
  isLoading: boolean
  storeName?: string | null
  className?: string
}

/**
 * Rep context banner shown in sidebar when a rep is creating an order.
 * Shows rep name, optional customer/store, and return link.
 */
export function RepContextBanner({
  repName,
  returnTo,
  isLoading,
  storeName,
  className,
}: RepContextBannerProps) {
  return (
    <div className={`px-4 py-3 bg-primary/5 border-b border-primary/10 ${className || ''}`}>
      <div className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4 text-primary" />
        <span className="font-medium text-primary">
          {isLoading ? 'Loading...' : `Rep: ${repName || 'Unknown'}`}
        </span>
      </div>

      {storeName && (
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          Customer: {storeName}
        </p>
      )}

      <Link
        href={returnTo}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 ml-6 transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        {getPortalReturnLabel(returnTo)}
      </Link>
    </div>
  )
}
