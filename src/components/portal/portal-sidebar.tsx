'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/lib/constants/navigation'

const indentClasses = ['', 'pl-3', 'pl-6', 'pl-9'] as const

function NavNode({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()
  const basePath = item.path
  const isActive = pathname === basePath || (basePath !== '/' && pathname.startsWith(basePath + '/'))
  const hasChildren = !!item.children?.length

  return (
    <div>
      <Link
        href={item.path}
        className={cn(
          'block rounded-md px-3 py-2 text-sm transition-colors',
          indentClasses[Math.min(depth, 3)],
          depth === 0 ? 'font-medium' : 'font-normal',
          isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        {item.name}
      </Link>

      {hasChildren ? (
        <div className="mt-1 space-y-1">
          {item.children!.map((child) => (
            <NavNode key={child.path} item={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface PortalSidebarProps {
  title: string
  nav: NavItem[]
}

export function PortalSidebar({ title, nav }: PortalSidebarProps) {
  return (
    <aside className="w-64 shrink-0 border-r bg-background p-4">
      <div className="mb-4 text-sm font-semibold text-foreground">{title}</div>
      <nav className="space-y-1">
        {nav.map((item) => (
          <NavNode key={item.path} item={item} />
        ))}
      </nav>
    </aside>
  )
}
