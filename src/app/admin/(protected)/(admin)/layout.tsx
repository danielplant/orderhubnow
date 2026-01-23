import type { ReactNode } from 'react'
import { auth } from '@/lib/auth/providers'
import { PortalLayout } from '@/components/portal'
import { adminNav } from '@/lib/constants/navigation'
import { ImageConfigProvider } from '@/lib/contexts'

export default async function AdminPortalLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const userName = session?.user?.name || 'Admin'

  return (
    <ImageConfigProvider>
      <PortalLayout
        title="Admin"
        nav={adminNav}
        logoutUrl="/login"
        userName={userName}
        userRole="admin"
        currentPortal="admin"
      >
        {children}
      </PortalLayout>
    </ImageConfigProvider>
  )
}
