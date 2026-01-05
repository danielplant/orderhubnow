import type { ReactNode } from 'react'
import { auth } from '@/lib/auth/providers'
import { LogoutButton } from '@/components/auth/logout-button'
import { RepSidebar } from '@/components/rep/rep-sidebar'

export default async function RepLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const repName = session?.user?.name || 'Sales Rep'
  const repId = session?.user?.repId

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="border-b bg-background px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">MyOrderHub — Rep Portal</div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Logged in as <span className="font-medium text-foreground">{repName}</span>
            </span>
            <LogoutButton callbackUrl="/rep/login" />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <RepSidebar repId={repId} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
