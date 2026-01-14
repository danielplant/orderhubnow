'use client'

import { useEffect } from 'react'
import { useCurrency } from '@/lib/contexts/currency-context'
import type { Currency } from '@/lib/types'

interface RepCurrencyDefaulterProps {
  country: string | null
}

/**
 * Sets the currency based on rep's country when entering the order flow.
 * Canada → CAD, USA → USD
 */
export function RepCurrencyDefaulter({ country }: RepCurrencyDefaulterProps) {
  const { setCurrency } = useCurrency()

  useEffect(() => {
    if (!country) return

    // Map country to currency
    const normalizedCountry = country.toUpperCase()
    let currency: Currency = 'CAD' // default

    if (
      normalizedCountry.includes('US') ||
      normalizedCountry === 'USA' ||
      normalizedCountry === 'UNITED STATES'
    ) {
      currency = 'USD'
    } else if (
      normalizedCountry.includes('CA') ||
      normalizedCountry === 'CANADA'
    ) {
      currency = 'CAD'
    }

    setCurrency(currency)
  }, [country, setCurrency])

  // This component renders nothing - it just sets the currency
  return null
}
