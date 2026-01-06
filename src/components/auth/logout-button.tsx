'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

interface LogoutButtonProps {
  callbackUrl?: string
}

// Storage key must match order-context.tsx
const DRAFT_ORDER_KEY = 'draft-order'

export function LogoutButton({ callbackUrl = '/admin/login' }: LogoutButtonProps) {
  const handleLogout = () => {
    // Clear cart/draft order before logout to prevent cart bleeding between users
    try {
      localStorage.removeItem(DRAFT_ORDER_KEY)
    } catch {
      // Ignore localStorage errors
    }
    signOut({ callbackUrl })
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
      <LogOut className="size-4" />
      <span>Logout</span>
    </Button>
  )
}
