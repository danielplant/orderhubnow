'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  orderNumber: string
  customerName: string | null
}

export function OrderSubmittedToast({ orderNumber, customerName }: Props) {
  const router = useRouter()
  const hasShownToast = useRef(false)

  useEffect(() => {
    // Only show toast once per mount
    if (hasShownToast.current) return
    hasShownToast.current = true

    const message = customerName
      ? `Order #${orderNumber} submitted for ${customerName}`
      : `Order #${orderNumber} submitted successfully`

    toast.success(message, { duration: 5000 })

    // Remove query params from URL without reload after a short delay
    // This ensures the toast has time to render before URL changes
    const timeout = setTimeout(() => {
      router.replace('/rep/orders', { scroll: false })
    }, 100)

    return () => clearTimeout(timeout)
  }, [orderNumber, customerName, router])

  return null
}
