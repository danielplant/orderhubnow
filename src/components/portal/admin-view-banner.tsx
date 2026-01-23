'use client'

import Link from 'next/link'
import { Eye, ArrowRight, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AdminViewBannerProps {
  repName: string
  repCode?: string
  isReadOnly?: boolean
}

/**
 * Banner shown when admin is viewing the rep portal in view-as mode.
 * Shows rep name and provides exit button to return to admin dashboard.
 */
export function AdminViewBanner({ repName, repCode, isReadOnly = true }: AdminViewBannerProps) {
  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
          <Eye className="size-4" />
          <span className="font-medium">
            Viewing as: {repName}
            {repCode && <span className="text-amber-600 dark:text-amber-400 ml-1">({repCode})</span>}
          </span>
          {isReadOnly && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Lock className="size-3" />
              Read-only
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" asChild className="h-7 text-xs">
          <Link href="/admin" className="flex items-center gap-1">
            Exit
            <ArrowRight className="size-3" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
