'use client'

import { useState } from 'react'
import { BuyerSidebar } from './buyer-sidebar'
import { BuyerHeaderCompact } from './buyer-header-compact'
import { BuyerNavDrawer } from './buyer-nav-drawer'

interface BuyerNavWrapperProps {
  children: React.ReactNode
}

/**
 * Responsive navigation wrapper for buyer portal.
 * Desktop: Left sidebar with content area.
 * Mobile/Tablet: Compact header with slide-out drawer.
 */
export function BuyerNavWrapper({ children }: BuyerNavWrapperProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen flex">
      {/* Desktop Sidebar */}
      <BuyerSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <BuyerHeaderCompact onMenuClick={() => setDrawerOpen(true)} />

        {/* Page Content */}
        <main className="flex-1">
          {children}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      <BuyerNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  )
}
