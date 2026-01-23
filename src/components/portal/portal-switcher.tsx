'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Shield, Code, Users } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RepPickerDialog } from './rep-picker-dialog'

export type Portal = 'admin' | 'developer' | 'rep'

interface PortalSwitcherProps {
  currentPortal: Portal
  userRole: 'admin' | 'rep'
  isViewAsMode?: boolean
}

const portalConfig = {
  admin: {
    label: 'Admin Portal',
    icon: Shield,
    href: '/admin',
  },
  developer: {
    label: 'Developer Portal',
    icon: Code,
    href: '/admin/dev',
  },
  rep: {
    label: 'Rep Portal',
    icon: Users,
    href: null, // Opens dialog instead
  },
} as const

/**
 * Portal switcher dropdown for admin users.
 * Allows switching between Admin, Developer, and Rep (via picker) portals.
 *
 * Only renders for admin users and hides in view-as mode.
 */
export function PortalSwitcher({ currentPortal, userRole, isViewAsMode }: PortalSwitcherProps) {
  const [repDialogOpen, setRepDialogOpen] = useState(false)

  // Only show for admin users, and hide in view-as mode
  if (userRole !== 'admin' || isViewAsMode) {
    return null
  }

  const current = portalConfig[currentPortal]
  const CurrentIcon = current.icon

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-3 h-9 text-sm font-normal"
          >
            <span className="flex items-center gap-2">
              <CurrentIcon className="size-4 text-muted-foreground" />
              {current.label}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Switch Portal
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Admin Portal */}
          <DropdownMenuItem
            asChild
            className={cn(currentPortal === 'admin' && 'bg-accent')}
          >
            <Link href="/admin" className="flex items-center gap-2">
              <Shield className="size-4" />
              Admin Portal
            </Link>
          </DropdownMenuItem>

          {/* Developer Portal */}
          <DropdownMenuItem
            asChild
            className={cn(currentPortal === 'developer' && 'bg-accent')}
          >
            <Link href="/admin/dev" className="flex items-center gap-2">
              <Code className="size-4" />
              Developer Portal
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Rep Portal - opens dialog */}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setRepDialogOpen(true)
            }}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Users className="size-4" />
            View as Rep...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RepPickerDialog open={repDialogOpen} onOpenChange={setRepDialogOpen} />
    </>
  )
}
