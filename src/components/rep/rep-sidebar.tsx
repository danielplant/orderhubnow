'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { repNav, type NavItem } from '@/lib/constants/navigation'
import { ClipboardList, LayoutDashboard, Plus } from 'lucide-react'

const iconMap: Record<string, React.ReactNode> = {
  '/rep': <LayoutDashboard className="size-4" />,
  '/rep/orders': <ClipboardList className="size-4" />,
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive = pathname === item.path ||
    (item.path !== '/rep' && pathname.startsWith(item.path + '/'))

  return (
    <Link
      href={item.path}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {iconMap[item.path]}
      {item.name}
    </Link>
  )
}

interface RepSidebarProps {
  repId?: string
}

export function RepSidebar({ repId }: RepSidebarProps) {
  // Build new order link with rep context
  const newOrderHref = repId
    ? `/buyer/select-journey?repId=${repId}&returnTo=${encodeURIComponent('/rep/orders')}`
    : '/rep/new-order'

  return (
    <aside className="w-56 shrink-0 border-r bg-background p-4 flex flex-col">
      <div className="mb-6">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Rep Portal
        </div>
      </div>

      <nav className="space-y-1 flex-1">
        {repNav.map((item) => (
          <NavLink key={item.path} item={item} />
        ))}
      </nav>

      {/* New Order Button */}
      <div className="pt-4 border-t">
        <Link
          href={newOrderHref}
          className="flex items-center justify-center gap-2 w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          New Order
        </Link>
      </div>
    </aside>
  )
}
