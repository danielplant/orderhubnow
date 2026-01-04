'use client'

import { useEffect, useRef } from 'react'
import { useOrder } from '@/lib/contexts/order-context'

/**
 * Client component that clears the cart when mounted on confirmation page.
 * Uses a ref to ensure clearAll is only called once.
 */
export function ConfirmationClient() {
  const { clearAll, totalItems } = useOrder()
  const clearedRef = useRef(false)

  useEffect(() => {
    // Only clear once, and only if there are items
    if (!clearedRef.current && totalItems > 0) {
      clearedRef.current = true
      clearAll()
    }
  }, [clearAll, totalItems])

  return null
}
