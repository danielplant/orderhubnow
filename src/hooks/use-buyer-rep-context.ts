'use client'

import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import { isValidPortalReturn, normalizeRepName } from '@/lib/utils/rep-context'

interface RepContextValue {
  repId: string | null
  returnTo: string            // Portal return (defaults to /rep/orders)
  safeReturnTo: string | null // Validated portal return
  editOrder: string | null
  repNameParam: string | null
  repName: string | null      // Fetched or fallback
  isRepContext: boolean
  isLoading: boolean
  buildHref: (basePath: string) => string
}

/**
 * Hook for accessing rep context in buyer flow.
 * Centralizes repId, returnTo, editOrder handling with validation.
 */
export function useBuyerRepContext(): RepContextValue {
  const searchParams = useSearchParams()
  const repId = searchParams.get('repId')
  const repNameParam = normalizeRepName(searchParams.get('repName'))
  const rawReturnTo = searchParams.get('returnTo')
  const editOrder = searchParams.get('editOrder')

  // Validate returnTo - only allow portal paths
  const safeReturnTo = isValidPortalReturn(rawReturnTo) ? rawReturnTo! : null

  // Portal return - allow /rep/* or /admin/*, fallback to /rep/orders
  const returnTo = isValidPortalReturn(rawReturnTo) ? rawReturnTo! : '/rep/orders'

  // Derive rep name synchronously - no async fetch needed
  // Use repNameParam if provided, else fallback to "Rep #ID"
  const repName = useMemo(() => {
    if (!repId) return null
    return repNameParam || `Rep #${repId}`
  }, [repId, repNameParam])

  // No async loading needed - all values derived synchronously
  const isLoading = false

  /**
   * Build a URL with rep context params preserved.
   */
  const buildHref = (basePath: string): string => {
    const params = new URLSearchParams()
    if (repId) params.set('repId', repId)
    if (repNameParam) params.set('repName', repNameParam)
    if (safeReturnTo) params.set('returnTo', safeReturnTo)
    if (editOrder) params.set('editOrder', editOrder)
    const qs = params.toString()
    return `${basePath}${qs ? `?${qs}` : ''}`
  }

  return {
    repId,
    returnTo,
    safeReturnTo,
    editOrder,
    repNameParam,
    repName,
    isRepContext: !!repId,
    isLoading,
    buildHref,
  }
}
