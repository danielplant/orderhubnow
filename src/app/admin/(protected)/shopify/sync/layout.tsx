'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Settings,
  Database,
  GitCompare,
  Play,
  Clock,
  History,
} from 'lucide-react';

const tabs = [
  { name: 'Dashboard', href: '/admin/shopify/sync', icon: LayoutDashboard },
  { name: 'Setup', href: '/admin/shopify/sync/setup', icon: Settings },
  { name: 'Discovery', href: '/admin/shopify/sync/discovery', icon: Database },
  { name: 'Mappings', href: '/admin/shopify/sync/mapping', icon: GitCompare },
  { name: 'Run Sync', href: '/admin/shopify/sync/run', icon: Play },
  { name: 'Schedules', href: '/admin/shopify/sync/schedules', icon: Clock },
  { name: 'History', href: '/admin/shopify/sync/history', icon: History },
];

export default function SyncServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sub-navigation tabs */}
      <div className="border-b border-border bg-card">
        <nav className="flex gap-1 px-6 overflow-x-auto" aria-label="Sync service navigation">
          {tabs.map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href !== '/admin/shopify/sync' && pathname.startsWith(tab.href));
            const Icon = tab.icon;

            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="flex-1 bg-muted/30">
        {children}
      </div>
    </div>
  );
}
