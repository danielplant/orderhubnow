import type { ReactNode } from 'react'
import { auth } from '@/lib/auth/providers'
import { PortalLayout } from '@/components/portal'
import { businessNav } from '@/lib/constants/navigation'
import { ImageConfigProvider } from '@/lib/contexts'

export default async function BusinessPortalLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const userName = session?.user?.name || 'Admin'

  return (
    <ImageConfigProvider>
      <PortalLayout
        title="Business"
        nav={businessNav}
        logoutUrl="/login"
        userName={userName}
        userRole="admin"
        currentPortal="business"
      >
        {children}
      </PortalLayout>
    </ImageConfigProvider>
  )
}
