import type { ReactNode } from 'react'
import { PortalSidebar } from './portal-sidebar'
import type { NavItem } from '@/lib/constants/navigation'
import type { Portal } from './portal-switcher'

interface PortalLayoutProps {
  title: string
  nav: NavItem[]
  logoutUrl: string
  userName: string
  children: ReactNode
  userRole?: 'admin' | 'rep'
  currentPortal?: Portal
  isViewAsMode?: boolean
  viewAsParams?: { repId: string; repName?: string } | null
}

export function PortalLayout({
  title,
  nav,
  logoutUrl,
  userName,
  children,
  userRole,
  currentPortal,
  isViewAsMode,
  viewAsParams,
}: PortalLayoutProps) {
  return (
    <div className="min-h-screen bg-muted/30 flex">
      <PortalSidebar
        title={title}
        nav={nav}
        userName={userName}
        logoutUrl={logoutUrl}
        userRole={userRole}
        currentPortal={currentPortal}
        isViewAsMode={isViewAsMode}
        viewAsParams={viewAsParams}
      />
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  )
}
