import type { ReactNode } from 'react'
import { auth } from '@/lib/auth/providers'
import { PortalLayout } from '@/components/portal'
import { devNav } from '@/lib/constants/navigation'
import { ImageConfigProvider } from '@/lib/contexts'

export default async function DevPortalLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const userName = session?.user?.name || 'Developer'

  return (
    <ImageConfigProvider>
      <PortalLayout
        title="Developer"
        nav={devNav}
        logoutUrl="/login"
        userName={userName}
        userRole="admin"
        currentPortal="developer"
      >
        {children}
      </PortalLayout>
    </ImageConfigProvider>
  )
}
