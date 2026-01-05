'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface ErrorToastProps {
  message: string
}

/**
 * Client component that shows an error toast and cleans up the URL.
 */
export function ErrorToast({ message }: ErrorToastProps) {
  const router = useRouter()

  useEffect(() => {
    toast.error(message, { duration: 6000 })

    // Remove error param from URL without reload
    router.replace('/rep/orders', { scroll: false })
  }, [message, router])

  return null
}
