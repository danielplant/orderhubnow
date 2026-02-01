'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface UseTableSearchOptions {
  /** Base path for navigation (e.g., '/admin/orders') */
  basePath?: string
}

export interface UseTableSearchReturn {
  /** Current search query from URL */
  q: string
  /** Current page number */
  page: number
  /** Current page size */
  pageSize: number
  /** Current sort column */
  sort: string
  /** Current sort direction */
  dir: 'asc' | 'desc'
  /** Get any URL param value */
  getParam: (key: string) => string | null
  /** Set a single URL param (null to remove) */
  setParam: (key: string, value: string | null) => void
  /** Set multiple URL params at once */
  setParams: (updates: Record<string, string | null>) => void
  /** Set page number */
  setPage: (page: number) => void
  /** Set sort column and direction */
  setSort: (sort: { columnId: string; direction: 'asc' | 'desc' }) => void
  /** Clear all filters (keeps pagination defaults) */
  clearFilters: () => void
}

/**
 * Hook for managing table search, filter, sort, and pagination via URL params.
 * Provides consistent behavior across all data tables.
 */
export function useTableSearch(options: UseTableSearchOptions = {}): UseTableSearchReturn {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { basePath } = options

  // Parse common params
  const q = searchParams.get('q') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '50')
  const sort = searchParams.get('sort') || ''
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  // Get any param
  const getParam = useCallback(
    (key: string) => searchParams.get(key),
    [searchParams]
  )

  // Set single param
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      // Reset to page 1 on filter changes (except page itself)
      if (key !== 'page') {
        params.delete('page')
      }
      const path = basePath ? `${basePath}?${params.toString()}` : `?${params.toString()}`
      router.push(path, { scroll: false })
    },
    [router, searchParams, basePath]
  )

  // Set multiple params
  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      let shouldResetPage = false

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
        if (key !== 'page') shouldResetPage = true
      }

      if (shouldResetPage) params.delete('page')

      const path = basePath ? `${basePath}?${params.toString()}` : `?${params.toString()}`
      router.push(path, { scroll: false })
    },
    [router, searchParams, basePath]
  )

  // Set page
  const setPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', String(Math.max(1, newPage)))
      const path = basePath ? `${basePath}?${params.toString()}` : `?${params.toString()}`
      router.push(path, { scroll: false })
    },
    [router, searchParams, basePath]
  )

  // Set sort
  const setSort = useCallback(
    (newSort: { columnId: string; direction: 'asc' | 'desc' }) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('sort', newSort.columnId)
      params.set('dir', newSort.direction)
      const path = basePath ? `${basePath}?${params.toString()}` : `?${params.toString()}`
      router.push(path, { scroll: false })
    },
    [router, searchParams, basePath]
  )

  // Clear all filters
  const clearFilters = useCallback(() => {
    const path = basePath || window.location.pathname
    router.push(path, { scroll: false })
  }, [router, basePath])

  return {
    q,
    page,
    pageSize,
    sort,
    dir,
    getParam,
    setParam,
    setParams,
    setPage,
    setSort,
    clearFilters,
  }
}
