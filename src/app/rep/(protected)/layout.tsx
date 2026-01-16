import type { ReactNode } from 'react'
import { auth } from '@/lib/auth/providers'
import { PortalLayout } from '@/components/portal'
import { repNav } from '@/lib/constants/navigation'

export default async function RepLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const repName = session?.user?.name || 'Sales Rep'

  return (
    <PortalLayout
      title="Rep Portal"
      nav={repNav}
      logoutUrl="/rep/login"
      userName={repName}
    >
      {children}
    </PortalLayout>
  )
}
