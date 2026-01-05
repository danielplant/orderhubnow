'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  orderNumber: string
  customerName: string | null
}

export function OrderSubmittedToast({ orderNumber, customerName }: Props) {
  const router = useRouter()

  useEffect(() => {
    const message = customerName
      ? `Order #${orderNumber} submitted for ${customerName}`
      : `Order #${orderNumber} submitted successfully`

    toast.success(message, { duration: 5000 })

    // Remove query params from URL without reload
    router.replace('/rep/orders', { scroll: false })
  }, [orderNumber, customerName, router])

  return null
}
