'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { buildRepHref } from '@/lib/utils/auth'

interface Props {
  orderNumber: string
  customerName: string | null
  /** View-as params to preserve when redirecting */
  viewAsParams?: { repId: string; repName?: string } | null
}

export function OrderSubmittedToast({ orderNumber, customerName, viewAsParams }: Props) {
  const router = useRouter()

  useEffect(() => {
    const message = customerName
      ? `Order #${orderNumber} submitted for ${customerName}`
      : `Order #${orderNumber} submitted successfully`

    toast.success(message, { duration: 5000 })

    // Remove query params from URL without reload, preserving view-as params
    const redirectUrl = buildRepHref('/rep/orders', viewAsParams)
    router.replace(redirectUrl, { scroll: false })
  }, [orderNumber, customerName, viewAsParams, router])

  return null
}
