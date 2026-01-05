import type { ReactNode } from 'react'
import { auth } from '@/lib/auth/providers'
import { LogoutButton } from '@/components/auth/logout-button'

export default async function RepLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const repName = session?.user?.name || 'Sales Rep'

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">MyOrderHub — Rep Portal</div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Logged in as <span className="font-medium text-foreground">{repName}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  )
}
