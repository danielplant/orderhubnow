'use client'

import { useSyncExternalStore, useCallback, useMemo } from 'react'

interface UseColumnVisibilityOptions {
  storageKey: string
  defaultColumns: string[]
}

interface UseColumnVisibilityReturn {
  visibleColumns: string[]
  setVisibleColumns: (columns: string[]) => void
  toggleColumn: (columnId: string, visible: boolean) => void
  resetColumns: () => void
  isHydrated: true
}

// Per-key listener management
const listenersByKey = new Map<string, Set<() => void>>()

// Snapshot cache: raw localStorage string → parsed array
// Ensures Object.is returns true when data hasn't changed (stable reference)
const snapshotCache = new Map<string, { raw: string | null; parsed: string[] }>()

function getListeners(key: string): Set<() => void> {
  let listeners = listenersByKey.get(key)
  if (!listeners) {
    listeners = new Set()
    listenersByKey.set(key, listeners)
  }
  return listeners
}

function emitChange(key: string) {
  const listeners = listenersByKey.get(key)
  if (listeners) {
    listeners.forEach((listener) => listener())
  }
}

// Listen for changes from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key && listenersByKey.has(e.key)) {
      emitChange(e.key)
    }
  })
}

/**
 * Hook for managing column visibility with localStorage persistence.
 * Uses useSyncExternalStore to avoid hydration flash.
 *
 * @example
 * const { visibleColumns, toggleColumn, resetColumns } = useColumnVisibility({
 *   storageKey: 'products-table-columns',
 *   defaultColumns: ['name', 'sku', 'price'],
 * })
 */
export function useColumnVisibility({
  storageKey,
  defaultColumns,
}: UseColumnVisibilityOptions): UseColumnVisibilityReturn {
  // Memoize default columns to avoid recreating functions on every render
  const defaultColumnsStable = useMemo(
    () => defaultColumns,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultColumns.join(',')]
  )

  const subscribe = useCallback(
    (callback: () => void) => {
      const listeners = getListeners(storageKey)
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    [storageKey]
  )

  const getSnapshot = useCallback((): string[] => {
    if (typeof window === 'undefined') return defaultColumnsStable

    try {
      const raw = localStorage.getItem(storageKey)
      const cached = snapshotCache.get(storageKey)

      // Return cached array if raw string unchanged (stable reference for Object.is)
      if (cached && cached.raw === raw) {
        return cached.parsed
      }

      // Parse and cache new result
      let parsed: string[]
      if (raw) {
        const result = JSON.parse(raw)
        parsed = Array.isArray(result) ? result : defaultColumnsStable
      } else {
        parsed = defaultColumnsStable
      }

      snapshotCache.set(storageKey, { raw, parsed })
      return parsed
    } catch {
      // localStorage not available or corrupted data
      return defaultColumnsStable
    }
  }, [storageKey, defaultColumnsStable])

  const getServerSnapshot = useCallback((): string[] => {
    return defaultColumnsStable
  }, [defaultColumnsStable])

  const visibleColumns = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setVisibleColumns = useCallback(
    (columns: string[]) => {
      try {
        const raw = JSON.stringify(columns)
        localStorage.setItem(storageKey, raw)
        // Update cache immediately for stable reference
        snapshotCache.set(storageKey, { raw, parsed: columns })
      } catch {
        // localStorage not available
      }
      emitChange(storageKey)
    },
    [storageKey]
  )

  const toggleColumn = useCallback(
    (columnId: string, visible: boolean) => {
      const current = getSnapshot()
      const next = visible
        ? [...current, columnId]
        : current.filter((id) => id !== columnId)
      setVisibleColumns(next)
    },
    [getSnapshot, setVisibleColumns]
  )

  const resetColumns = useCallback(() => {
    setVisibleColumns(defaultColumnsStable)
  }, [defaultColumnsStable, setVisibleColumns])

  return {
    visibleColumns,
    setVisibleColumns,
    toggleColumn,
    resetColumns,
    isHydrated: true, // Always true with useSyncExternalStore
  }
}
