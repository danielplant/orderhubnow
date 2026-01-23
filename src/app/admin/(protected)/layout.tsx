import type { ReactNode } from 'react'

/**
 * Protected layout - handles authentication only.
 * Child route groups (admin) and (dev) handle their own portal layouts.
 * This prevents layout nesting issues.
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  // Auth is handled by middleware - this layout just passes through children
  // Each child route group has its own PortalLayout
  return <>{children}</>
}
