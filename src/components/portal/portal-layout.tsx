import type { ReactNode } from 'react'
import { PortalHeader } from './portal-header'
import { PortalSidebar } from './portal-sidebar'
import type { NavItem } from '@/lib/constants/navigation'

interface PortalLayoutProps {
  title: string
  nav: NavItem[]
  logoutUrl: string
  userName: string
  children: ReactNode
}

export function PortalLayout({ title, nav, logoutUrl, userName, children }: PortalLayoutProps) {
  return (
    <div className="min-h-screen bg-muted/30">
      <PortalHeader title={title} userName={userName} logoutUrl={logoutUrl} />
      <div className="flex min-h-[calc(100vh-65px)]">
        <PortalSidebar title={title} nav={nav} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
