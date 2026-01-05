'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

interface LogoutButtonProps {
  callbackUrl?: string
}

export function LogoutButton({ callbackUrl = '/admin/login' }: LogoutButtonProps) {
  const handleLogout = () => {
    signOut({ callbackUrl })
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
      <LogOut className="size-4" />
      <span>Logout</span>
    </Button>
  )
}
