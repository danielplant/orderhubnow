'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoutButton } from '@/components/auth/logout-button'
import { BRAND_NAME, APP_NAME } from '@/lib/constants/brand'
import type { NavItem } from '@/lib/constants/navigation'
import { PortalSwitcher, type Portal } from './portal-switcher'
import { buildRepHref } from '@/lib/utils/auth'

const indentClasses = ['', 'pl-3', 'pl-6', 'pl-9'] as const

interface NavNodeProps {
  item: NavItem
  depth?: number
  pathname: string  // Hoisted from parent to avoid redundant usePathname calls
  viewAsParams?: { repId: string; repName?: string } | null
}

function NavNode({ item, depth = 0, pathname, viewAsParams }: NavNodeProps) {
  // Section header - render label only, no link
  if (item.section) {
    return (
      <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase text-muted-foreground tracking-wider first:mt-0">
        {item.name}
      </div>
    )
  }

  // Back link - render with arrow
  if (item.back && item.path) {
    const href = buildRepHref(item.path, viewAsParams)
    return (
      <Link
        href={href}
        className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        {item.name}
      </Link>
    )
  }

  // Regular nav item
  const basePath = item.path
  const hasChildren = !!item.children?.length

  // Active state: exact match OR prefix match only if item has children
  // This prevents /admin from being active on /admin/orders
  const isActive =
    !!basePath &&
    (pathname === basePath || (hasChildren && pathname.startsWith(basePath + '/')))

  // Skip rendering if no path (shouldn't happen for non-section items, but guard)
  if (!basePath) return null

  const href = buildRepHref(basePath, viewAsParams)

  return (
    <div>
      <Link
        href={href}
        className={cn(
          'block rounded-md px-3 py-2 text-sm transition-colors',
          indentClasses[Math.min(depth, 3)],
          depth === 0 ? 'font-medium' : 'font-normal',
          isActive
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        {item.name}
      </Link>

      {hasChildren ? (
        <div className="mt-1 space-y-1">
          {item.children!.map((child, index) => (
            <NavNode
              key={child.path ?? `child-${index}`}
              item={child}
              depth={depth + 1}
              pathname={pathname}
              viewAsParams={viewAsParams}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface PortalSidebarProps {
  title: string
  nav: NavItem[]
  userName: string
  logoutUrl: string
  userRole?: 'admin' | 'rep'
  currentPortal?: Portal
  isViewAsMode?: boolean
  viewAsParams?: { repId: string; repName?: string } | null
}

export function PortalSidebar({
  title,
  nav,
  userName,
  logoutUrl,
  userRole,
  currentPortal,
  isViewAsMode,
  viewAsParams,
}: PortalSidebarProps) {
  // Hoist usePathname here to avoid redundant calls in NavNode recursion
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r bg-background">
      {/* Top: Tenant Brand + Portal Title */}
      <div className="border-b p-4">
        <div className="text-lg font-semibold">{BRAND_NAME}</div>
        <div className="text-xs text-muted-foreground">{APP_NAME} · {title}</div>
      </div>

      {/* Middle: Navigation (scrollable) */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {nav.map((item, index) => (
          <NavNode
            key={item.path ?? `nav-${index}`}
            item={item}
            pathname={pathname}
            viewAsParams={viewAsParams}
          />
        ))}
      </nav>

      {/* Bottom: Portal Switcher + User + Logout */}
      <div className="border-t p-4 space-y-3">
        {/* Portal Switcher - admin only, not in view-as mode */}
        {userRole === 'admin' && currentPortal && !isViewAsMode && (
          <PortalSwitcher
            currentPortal={currentPortal}
            userRole={userRole}
            isViewAsMode={isViewAsMode}
          />
        )}

        <div>
          <div className="mb-2 text-sm text-muted-foreground">{userName}</div>
          <LogoutButton callbackUrl={logoutUrl} />
        </div>
      </div>
    </aside>
  )
}
