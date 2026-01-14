'use client'

import { useState, useEffect, useCallback } from 'react'

export interface UserPreferences {
  collections?: {
    hideEmpty?: boolean
  }
  products?: {
    pageSize?: number
  }
}

const DEFAULT_PREFERENCES: UserPreferences = {
  collections: {
    hideEmpty: true,
  },
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch preferences on mount
  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch('/api/user/preferences')
        if (response.ok) {
          const data = await response.json()
          setPreferences(data)
        }
      } catch (err) {
        console.error('Failed to fetch preferences:', err)
        setError('Failed to load preferences')
      } finally {
        setLoading(false)
      }
    }
    fetchPreferences()
  }, [])

  // Update a preference
  const updatePreference = useCallback(
    async (key: string, value: unknown) => {
      try {
        const response = await fetch('/api/user/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })

        if (response.ok) {
          const updated = await response.json()
          setPreferences(updated)
          return true
        }
        return false
      } catch (err) {
        console.error('Failed to update preference:', err)
        setError('Failed to save preference')
        return false
      }
    },
    []
  )

  return {
    preferences,
    loading,
    error,
    updatePreference,
  }
}
