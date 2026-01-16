import type { ReactNode } from 'react'
import { auth } from '@/lib/auth/providers'
import { PortalLayout } from '@/components/portal'
import { adminNav } from '@/lib/constants/navigation'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const userName = session?.user?.name || 'Admin'

  return (
    <PortalLayout
      title="Admin"
      nav={adminNav}
      logoutUrl="/admin/login"
      userName={userName}
    >
      {children}
    </PortalLayout>
  )
}
